import { canon } from '@/lib/ledger/merchantCanon';
import { resolveAuMerchantAlias } from '@/lib/ledger/auMerchantAliases';

/**
 * 编辑距离（Damerau-Levenshtein 的受限变体，即 optimal string alignment）：
 * 在插入/删除/替换之外，把相邻两字符互换算作一次操作。
 * STT 与打字最常见的错拼正是相邻换位（如 Colse/Coles），
 * 用普通 Levenshtein 距离会把它算成 2（两次替换），导致漏并——
 * 加这一项操作正是为了让这类典型错拼落在阈值内。
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prevPrev = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = cur;
    cur = new Array<number>(b.length + 1);
  }
  return prev[b.length];
}

/**
 * 短名称的模糊匹配下限：低于此长度只做精确（规范化后）匹配，不做模糊匹配。
 *
 * 阈值取长度的 30% 在短名称上会向下取到 0，若再套 Math.max(1, …) 保底，
 * 等于把阈值钉死在 1——任意编辑距离为 1 的两个短名称都会被误并
 * （如「永旺」/「永辉」、Aldi/Audi）。这些恰恰是真实商户名最常见的长度
 * （coles/aldi/kmart/bp，以及几乎所有中文品牌），所以不能靠保底阈值兜底，
 * 只能在这个长度以下直接关闭模糊匹配。
 */
const MIN_FUZZY_LEN = 5;

/**
 * 把新出现的 merchant 归并到该用户历史用过的写法上。
 *
 * 短名称（< MIN_FUZZY_LEN）只接受精确匹配；达到该长度后按目标长度的 30%
 * 取模糊匹配阈值，能吸收 STT 的轻微错拼（woworths → Woolworths），又不会
 * 把 Coles 误并到 Woolworths。宁可漏并，不可错并——错并会静默污染历史
 * 数据，而漏并只是多一个待归并的写法。
 *
 * 澳洲连锁商户的缩写/俗称（如 "woolies"/"JB"）先查 auMerchantAliases.ts 的
 * 词典——这是确定性的精确匹配，比编辑距离猜测更可信，且不依赖用户历史里
 * 是否出现过官方写法（新用户第一次说"woolies"也能直接归并），所以排在
 * 历史模糊匹配之前。
 */
export function normalizeMerchant(input: string | null, known: string[]): string | null {
  if (input === null) return null;
  const alias = resolveAuMerchantAlias(input);
  if (alias !== null) return alias;
  const target = canon(input);
  if (!target) return input;

  if (target.length < MIN_FUZZY_LEN) {
    return known.find((k) => canon(k) === target) ?? input;
  }

  let best: { value: string; d: number } | null = null;
  for (const k of known) {
    const d = distance(target, canon(k));
    if (best === null || d < best.d) best = { value: k, d };
  }
  if (best === null) return input;

  const threshold = Math.floor(target.length * 0.3);
  return best.d <= threshold ? best.value : input;
}
