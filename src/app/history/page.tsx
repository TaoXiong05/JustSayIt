'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useLedger } from '@/lib/ledger/useLedger';
import { filterHistory, groupByDay, type HistoryFilter } from '@/lib/ledger/history';
import { MonthSwitcher, useMonthNav } from '@/components/MonthSwitcher';
import { TransactionRow, formatAmount } from '@/components/TransactionRow';
import { useLocale } from '@/lib/i18n/context';

const EMPTY_FILTER: HistoryFilter = { dateFrom: '', dateTo: '', keyword: '' };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 某月的 [首日, 末日]（YYYY-MM-DD，双闭）——month 恒为首日正午构造。 */
function monthBounds(month: Date): { start: string; end: string } {
  const y = month.getFullYear();
  const m = month.getMonth();
  const last = new Date(y, m + 1, 0, 12);
  return {
    start: `${y}-${pad2(m + 1)}-01`,
    end: `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`,
  };
}

function formatDayHeader(dateStr: string, locale: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d, 12));
}

export default function HistoryPage() {
  const ledger = useLedger();
  const transactions = ledger.transactions;
  const { t, locale } = useLocale();
  const nav = useMonthNav(transactions);

  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);

  const filterActive = Boolean(filter.dateFrom || filter.dateTo || filter.keyword?.trim());

  // 数据源两条路径互斥（方案明确：筛选激活态**替换**月份浏览，不叠加）：
  // 1) 无筛选 → 只看 MonthSwitcher 当前月；
  // 2) 任一筛选项非空 → 对整个 transactions 数组做 filterHistory
  //    （关键词可以命中当前月以外的记录——"搜索逃逸月范围"是刻意为之）。
  const visible = useMemo(() => {
    if (filterActive) {
      return filterHistory(transactions, {
        dateFrom: filter.dateFrom || undefined,
        dateTo: filter.dateTo || undefined,
        keyword: filter.keyword || undefined,
      });
    }
    const { start, end } = monthBounds(nav.month);
    return filterHistory(transactions, { dateFrom: start, dateTo: end });
  }, [transactions, filterActive, filter, nav.month]);

  const groups = useMemo(() => groupByDay(visible), [visible]);

  // 桌面端第二栏的可见集合净额汇总（无图表，纯数字——Global Constraint 5）
  const summaryByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of visible) {
      const sign = t.type === 'INCOME' ? 1 : -1;
      map.set(t.currency, (map.get(t.currency) ?? 0) + sign * t.amountCents);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [visible]);

  function clearFilter(): void {
    // 清筛选回到「当前月」而非筛选前浏览的那个月（既有决策，不恢复旧月）
    setFilter(EMPTY_FILTER);
    nav.resetMonth();
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 pb-24 md:pb-6 lg:max-w-6xl">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-xl font-bold text-ink">{t('navHistory')}</h1>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-expanded={searchOpen}
          aria-label={t('historySearchLabel')}
          className="flex items-center gap-2 rounded-md bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {searchOpen ? (
            <X aria-hidden="true" className="size-4" />
          ) : (
            <Search aria-hidden="true" className="size-4" />
          )}
          <span className="hidden sm:inline">{t('historySearchLabel')}</span>
        </button>
      </header>

      {/* 筛选面板：纯 Tailwind disclosure（Global Constraint 4：不用 Radix） */}
      {searchOpen && (
        <section
          aria-label={t('historySearchLabel')}
          className="mb-4 rounded-lg border border-border bg-surface p-3 shadow-card"
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-muted">
              {t('historyDateFrom')}
              <input
                type="date"
                value={filter.dateFrom}
                onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value }))}
                className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-xs font-medium text-muted">
              {t('historyDateTo')}
              <input
                type="date"
                value={filter.dateTo}
                onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value }))}
                className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted">
              <span className="sr-only">{t('historyKeywordPlaceholder')}</span>
              <input
                type="search"
                placeholder={t('historyKeywordPlaceholder')}
                value={filter.keyword}
                onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
                className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <button
              type="button"
              onClick={clearFilter}
              className="flex items-center gap-1.5 rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              <SlidersHorizontal aria-hidden="true" className="size-3.5" />
              {t('historyClearFilter')}
            </button>
          </div>
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-6">
        <div>
          {/* 筛选激活时月份浏览失活：按钮禁用 + 整块降透明度 */}
          <div className="mb-4">
            <MonthSwitcher
              month={nav.month}
              onChange={nav.setMonth}
              earliestMonth={nav.earliestMonth}
              disabled={filterActive}
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
              {filterActive ? t('historyNoResults') : t('emptyLedger')}
            </p>
          ) : (
            <div>
              {groups.map((day) => (
                <section key={day.date} className="mb-4">
                  <header className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-muted">
                      {formatDayHeader(day.date, locale)}
                    </h2>
                    {day.subtotalsByCurrency.map((s) => (
                      <span
                        key={s.currency}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.netCents >= 0
                            ? 'bg-income-soft text-income'
                            : 'bg-expense-soft text-expense'
                        }`}
                      >
                        {formatAmount(s.netCents, s.currency)} {s.currency}
                      </span>
                    ))}
                  </header>
                  <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
                    {day.items.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <h2 className="font-display text-sm font-semibold text-ink">
              {t('historySummaryTitle')}
            </h2>
            {summaryByCurrency.length > 0 && (
              <ul className="mt-3 space-y-2">
                {summaryByCurrency.map(([currency, netCents]) => (
                  <li key={currency} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{currency}</span>
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        netCents >= 0 ? 'text-income' : 'text-expense'
                      }`}
                    >
                      {formatAmount(netCents, currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}