/** 比较用的规范形式：去空格、转小写 */
function canon(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

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
 * 把新出现的 merchant 归并到该用户历史用过的写法上。
 *
 * 阈值取长度的 30%（至少 1）：既能吸收 STT 的轻微错拼（woworths → Woolworths），
 * 又不会把 Coles 误并到 Woolworths。宁可漏并，不可错并——错并会静默污染
 * 历史数据，而漏并只是多一个待归并的写法。
 */
export function normalizeMerchant(input: string | null, known: string[]): string | null {
  if (input === null) return null;
  const target = canon(input);
  if (!target) return input;

  let best: { value: string; d: number } | null = null;
  for (const k of known) {
    const d = distance(target, canon(k));
    if (best === null || d < best.d) best = { value: k, d };
  }
  if (best === null) return input;

  const threshold = Math.max(1, Math.floor(target.length * 0.3));
  return best.d <= threshold ? best.value : input;
}
