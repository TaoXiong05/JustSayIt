'use client';

import { useMemo, useState } from 'react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';

/**
 * 把任意 Date 归一化为「当月 1 日正午」的本地 Date。用正午构造
 * 是为了让后续 setMonth 的偏移运算不会踩到夏令时边界（子夜会被
 * DST 拨成前一天 23:00，把日历日挪走）——stats.ts 的 UTC 正午技巧
 * 在这个纯本地日期场景下的对应做法。
 */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function shiftMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 12);
}

function monthKey(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

/**
 * History 与 Stats 共用的月份导航状态（Global Constraint 6：只实现一份）。
 * History 在月份浏览与全量搜索两种数据源之间切换时，需要把 month 重置回
 * 当前月以符合「清筛选后回到当前月」——由调用方 setMonth(startOfMonth(new Date()))
 * 或直接调用 resetMonth 达成。
 * 派生逻辑放在这里而非 store，与 page.tsx「不在 getSnapshot 里做筛选」的
 * 既有约定一致。
 */
export function useMonthNav(transactions: Transaction[]) {
  const [month, setMonthState] = useState<Date>(() => startOfMonth(new Date()));

  const earliestMonth = useMemo(() => {
    // replay.ts 的排序是 date 降序，末尾最旧；但这里不依赖入参顺序，
    // 全量扫一遍取最小月份，防止未来调用方传入不同排序的数组。
    let minKey = Infinity;
    for (const t of transactions) {
      const key = Number(t.date.slice(0, 4)) * 12 + (Number(t.date.slice(5, 7)) - 1);
      if (key < minKey) minKey = key;
    }
    if (!Number.isFinite(minKey)) return null;
    return new Date(Math.floor(minKey / 12), minKey % 12, 1, 12);
  }, [transactions]);

  return {
    month,
    setMonth: (next: Date) => setMonthState(startOfMonth(next)),
    resetMonth: () => setMonthState(startOfMonth(new Date())),
    earliestMonth,
    atCurrentMonth: monthKey(month) === monthKey(new Date()),
    atEarliestMonth: earliestMonth !== null && monthKey(month) <= monthKey(earliestMonth),
  };
}

/**
 * 纯展示组件：‹ 月份 ›。不知道 stats 或 history 的存在（Task 8 step 3）。
 * - ›（下月）在「month 已是当前日历月」时禁用，禁止浏览未来。
 * - ‹（上月）在 earliestMonth 为 null（还没有任何账目）或 month 已是
 *   最早月时禁用。
 * - disabled 由调用方用来表达「当前数据源不支持月份浏览」（如 History
 *   处于全局搜索激活态），表现为按钮禁用 + 整体降透明度。
 */
export function MonthSwitcher({
  month,
  onChange,
  earliestMonth,
  disabled = false,
}: {
  month: Date;
  onChange: (next: Date) => void;
  earliestMonth: Date | null;
  disabled?: boolean;
}) {
  const { locale, t } = useLocale();
  const now = new Date();
  // ‹ 只在「恰好是最早月」时禁用（方案原文：month equals earliestMonth）。
  // 用 === 而非 <=，避免 caller 传入比 earliestMonth 更早的月时反而禁用。
  const prevDisabled =
    disabled || earliestMonth === null || monthKey(month) === monthKey(earliestMonth);
  // › 在当前日历月时禁用，禁止浏览未来。
  const nextDisabled = disabled || monthKey(month) >= monthKey(now);

  const label = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(month);

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md border border-border bg-surface p-1 transition-opacity ${
        disabled ? 'opacity-40' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, -1))}
        disabled={prevDisabled}
        aria-label={t('monthPrev')}
        className="flex size-8 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        ‹
      </button>
      <span className="font-display text-sm font-semibold text-ink">{label}</span>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={nextDisabled}
        aria-label={t('monthNext')}
        className="flex size-8 items-center justify-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}