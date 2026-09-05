import type { Transaction } from '@/lib/ai/schema';

export type DayGroup = {
  date: string;
  items: Transaction[];
  /**
   * 当天该币种的净额（收入 − 支出）。
   *
   * 与 Stats 的「income/expense 分开跟踪、绝不互抵」的周期汇总口径刻意不同：
   * 这是**单日**的小计，给出一个净额更符合"这一天花了多少/净出入多少"的
   * 直觉，且下方紧跟着逐笔明细，不会丢失 income/expense 的方向信息。
   * 请勿按 Stats 的约定"修正"它——计划文档明确要求保留这个区分。
   */
  subtotalsByCurrency: { currency: string; netCents: number }[];
};

/**
 * 按天分组，组序为「最新日期在前」。
 * 组序显式按 date 降序排序，不依赖调用方入参顺序——日期是 YYYY-MM-DD，
 * 字典序即时间序。组内 items 保持入参的相对顺序（replay.ts 已按 date 降序，
 * 同日保持写入顺序，使刚记的账出现在当日组内靠后位置）。
 */
export function groupByDay(transactions: Transaction[]): DayGroup[] {
  const byDate = new Map<string, DayGroup>();
  for (const t of transactions) {
    let group = byDate.get(t.date);
    if (!group) {
      group = { date: t.date, items: [], subtotalsByCurrency: [] };
      byDate.set(t.date, group);
    }
    group.items.push(t);
    const sign = t.type === 'INCOME' ? 1 : -1;
    const subtotal = group.subtotalsByCurrency.find((s) => s.currency === t.currency);
    if (subtotal) {
      subtotal.netCents += sign * t.amountCents;
    } else {
      group.subtotalsByCurrency.push({ currency: t.currency, netCents: sign * t.amountCents });
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export type HistoryFilter = {
  dateFrom?: string;
  dateTo?: string;
  /** 大小写不敏感的 merchant / description 子串匹配（不匹配 category）。 */
  keyword?: string;
};

/**
 * 纯客户端内存筛选（Global Constraint 7）：对完整数组一次过滤。
 * 日期边界与 computeStats 同款字符串比较：`t.date >= dateFrom && t.date <= dateTo`，
 * 每个边界独立可选（缺省即无界）。keyword 命中的是 merchant 或 description
 * **之一**即可——设计咨询明确把关键词搜索限定到商户/描述，不含分类。
 */
export function filterHistory(transactions: Transaction[], filter: HistoryFilter): Transaction[] {
  const keyword = filter.keyword?.trim().toLowerCase();
  return transactions.filter((t) => {
    if (filter.dateFrom && t.date < filter.dateFrom) return false;
    if (filter.dateTo && t.date > filter.dateTo) return false;
    if (keyword) {
      const merchantHit = t.merchant?.toLowerCase().includes(keyword) ?? false;
      const descriptionHit = t.description.toLowerCase().includes(keyword);
      if (!merchantHit && !descriptionHit) return false;
    }
    return true;
  });
}

/**
 * 最近的 n 笔。replay.ts 对 transactions 的排序是 date 降序（最新在前），
 * 所以「最近 n 笔」就是数组前 n 项——不要按天升序假设去 slice(-n).reverse()。
 * 该假设以 replay.ts 第 45-47 行的 sort 为准，改动排序时必须回来改这里。
 */
export function recentTransactions(transactions: Transaction[], n: number): Transaction[] {
  return transactions.slice(0, n);
}