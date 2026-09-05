import type { CategoryKey, Transaction } from '@/lib/ai/schema';

export type CategoryTotal = {
  category: CategoryKey;
  totalCents: number;
  transactions: Transaction[];
};

export type CurrencyStats = {
  currency: string;
  expenseByCategory: CategoryTotal[];
  totalExpenseCents: number;
  totalIncomeCents: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKeyOfUtcNoon(utcNoon: Date): string {
  // utcNoon 已经是"用 UTC 读出来就是正确日历日"的构造，直接用 UTC 分量取值，
  // 不再经过 Intl 二次换算——避免另一层时区转换把日期挪一天。
  return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
}

/** 取某个时刻在指定时区下的日历日 { year, month(1-12), day, weekday(0=周日..6=周六) }。 */
function partsInTimeZone(
  d: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/**
 * 月边界（Plan 5 Task 11：week 模式已删除，Stats 只有月口径）。
 * 返回 [当月第一天, 下月第一天)，字符串比较即可判断 t.date 是否落在周期内。
 */
export function periodRange(referenceDate: Date, timeZone: string): { start: string; end: string } {
  const { year, month } = partsInTimeZone(referenceDate, timeZone);
  const start = `${year}-${pad2(month)}-01`;
  const nextMonthUtcNoon = new Date(Date.UTC(year, month, 1, 12)); // Date.UTC 的月份天然进位跨年
  const end = dateKeyOfUtcNoon(nextMonthUtcNoon);
  return { start, end };
}

/**
 * 按月分类统计（spec §6.4）：对内存里的 Transaction[] 做一次 reduce，
 * 不引入索引/查询层。四条规则：按币种分组不跨币种求和、边界按用户时区、
 * 只对 EXPENSE 求总支出（INCOME 单独展示不抵扣）、口径以 date 字段为准。
 */
export function computeStats(
  transactions: Transaction[],
  referenceDate: Date,
  timeZone: string,
): CurrencyStats[] {
  const { start, end } = periodRange(referenceDate, timeZone);
  const inPeriod = transactions.filter((t) => t.date >= start && t.date < end);

  const byCurrency = new Map<string, CurrencyStats>();
  for (const t of inPeriod) {
    let stats = byCurrency.get(t.currency);
    if (!stats) {
      stats = { currency: t.currency, expenseByCategory: [], totalExpenseCents: 0, totalIncomeCents: 0 };
      byCurrency.set(t.currency, stats);
    }
    if (t.type === 'INCOME') {
      stats.totalIncomeCents += t.amountCents;
      continue;
    }
    stats.totalExpenseCents += t.amountCents;
    let cat = stats.expenseByCategory.find((c) => c.category === t.category);
    if (!cat) {
      cat = { category: t.category, totalCents: 0, transactions: [] };
      stats.expenseByCategory.push(cat);
    }
    cat.totalCents += t.amountCents;
    cat.transactions.push(t);
  }

  for (const stats of byCurrency.values()) {
    stats.expenseByCategory.sort((a, b) => b.totalCents - a.totalCents);
  }

  return [...byCurrency.values()];
}
