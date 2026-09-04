import type { CategoryKey, Transaction } from '@/lib/ai/schema';

export type StatsPeriod = 'week' | 'month';

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
 * 周/月边界（spec §6.4 规则 2：按用户时区，不按 UTC；周一为周起点）。
 * 返回值是 YYYY-MM-DD 字符串——Transaction.date 本身就是已按用户时区
 * 解析好的日历日字符串（spec §5.4），直接做字符串比较即可判断是否落在
 * 周期内，不需要再对每条账目做时区转换。
 */
export function periodRange(
  period: StatsPeriod,
  referenceDate: Date,
  timeZone: string,
): { start: string; end: string } {
  const { year, month, day, weekday } = partsInTimeZone(referenceDate, timeZone);
  // 用 UTC 正午构造"代表这个日历日"的 Date，避免夏令时/边界问题——
  // 后续所有算术都在这个安全的 UTC 正午基准上做，最后按 UTC 分量读回字符串。
  const todayUtcNoon = new Date(Date.UTC(year, month - 1, day, 12));

  if (period === 'month') {
    const start = `${year}-${pad2(month)}-01`;
    const nextMonthUtcNoon = new Date(Date.UTC(year, month, 1, 12)); // Date.UTC 的月份天然进位跨年
    const end = dateKeyOfUtcNoon(nextMonthUtcNoon);
    return { start, end };
  }

  // week：weekday 0=周日..6=周六；周一为起点，需要回退的天数：周日回退 6 天，
  // 其余回退 (weekday - 1) 天。
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const weekStartUtcNoon = new Date(todayUtcNoon);
  weekStartUtcNoon.setUTCDate(weekStartUtcNoon.getUTCDate() - daysSinceMonday);
  const weekEndUtcNoon = new Date(weekStartUtcNoon);
  weekEndUtcNoon.setUTCDate(weekEndUtcNoon.getUTCDate() + 7);
  return { start: dateKeyOfUtcNoon(weekStartUtcNoon), end: dateKeyOfUtcNoon(weekEndUtcNoon) };
}

/**
 * 按周/月的分类统计（spec §6.4）：对内存里的 Transaction[] 做一次 reduce，
 * 不引入索引/查询层。四条规则：按币种分组不跨币种求和、边界按用户时区、
 * 只对 EXPENSE 求总支出（INCOME 单独展示不抵扣）、口径以 date 字段为准。
 */
export function computeStats(
  transactions: Transaction[],
  period: StatsPeriod,
  referenceDate: Date,
  timeZone: string,
): CurrencyStats[] {
  const { start, end } = periodRange(period, referenceDate, timeZone);
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
