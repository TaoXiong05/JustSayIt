'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { useLedger } from '@/lib/ledger/useLedger';
import { filterHistory, groupByDay, type HistoryFilter } from '@/lib/ledger/history';
import { MonthSwitcher, useMonthNav } from '@/components/MonthSwitcher';
import { TransactionRow, formatAmount } from '@/components/TransactionRow';
import { useLocale } from '@/lib/i18n/context';

const EMPTY_FILTER: HistoryFilter = { dateFrom: '', dateTo: '', keyword: '' };

/** 今天的日历日字符串（YYYY-MM-DD，按用户本地时区）——跟 Transaction.date
 * 同一种格式，用来判断"今天"这组默认展开。en-CA 的日期格式恰好就是
 * ISO 顺序（年-月-日），借用它省去自己拼 pad2 的麻烦。 */
function todayDateKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
}

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

  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  // 按天折叠：默认只有"今天"展开，其余天默认收起（brief 的默认态要求）。
  // 用户手动展开过的天记在这个 Set 里，跟 filterActive 是两回事——见下面
  // isDayOpen 的合并逻辑。
  const [manuallyOpenedDays, setManuallyOpenedDays] = useState<Set<string>>(
    () => new Set([todayDateKey()]),
  );

  const filterActive = Boolean(filter.dateFrom || filter.dateTo || filter.keyword?.trim());

  function toggleDay(date: string): void {
    setManuallyOpenedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  // 筛选/搜索命中的结果强制展开——用户搜东西是为了立刻看到它，折叠起来
  // 反而要求"搜到了再点开"，跟搜索本身的意图矛盾。只有正常按月浏览、
  // 没有筛选生效时，才用手动展开集合 + "今天默认展开"的规则。
  function isDayOpen(date: string): boolean {
    return filterActive || manuallyOpenedDays.has(date);
  }

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
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold text-ink">{t('navHistory')}</h1>
      </header>

      {/* 搜索框挪到标题正下方、常驻可见（brief 明确要求：不再是右上角一个
          图标按钮点开才看到）。日期范围筛选留作次要的"更多筛选"折叠面板——
          既满足"搜索框要显眼"，又不丢"日期+关键词组合搜索"这个已有能力。 */}
      <div className="mb-4 flex items-center gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t('historyKeywordPlaceholder')}</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            placeholder={t('historyKeywordPlaceholder')}
            value={filter.keyword}
            onChange={(e) => setFilter((f) => ({ ...f, keyword: e.target.value }))}
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() => setMoreFiltersOpen((v) => !v)}
          aria-expanded={moreFiltersOpen}
          aria-label={t('historyMoreFilters')}
          title={t('historyMoreFilters')}
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            moreFiltersOpen || filter.dateFrom || filter.dateTo
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-border bg-surface text-muted hover:bg-surface-2 hover:text-ink'
          }`}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
        </button>
        {/* 只要有筛选生效就露出清除入口——不是只有打开"更多筛选"面板才能
            清空：单纯打了关键词、没碰日期范围的最常见情况，不该逼用户先
            展开另一个面板才能清掉搜索。 */}
        {filterActive && (
          <button
            type="button"
            onClick={clearFilter}
            className="shrink-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {t('historyClearFilter')}
          </button>
        )}
      </div>

      {/* 次要的日期范围面板：纯 Tailwind disclosure（Global Constraint 4：
          不用 Radix——这里不是"真正棘手的交互"，用不上 Dialog/Popover）。 */}
      {moreFiltersOpen && (
        <section
          aria-label={t('historyMoreFilters')}
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
              {groups.map((day) => {
                const open = isDayOpen(day.date);
                return (
                  <section key={day.date} className="mb-3">
                    {/* 折叠态是天头本身的按钮，不是天头旁边另一个按钮——整行
                        都可点，触摸目标够大，符合 brief 的 mobile-friendly 要求。 */}
                    <button
                      type="button"
                      onClick={() => toggleDay(day.date)}
                      aria-expanded={open}
                      className="mb-1.5 flex w-full flex-wrap items-center gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-surface-2"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 shrink-0 text-muted transition-transform duration-200 ${
                          open ? '' : '-rotate-90'
                        }`}
                      />
                      <h2 className="font-display text-sm font-semibold text-muted">
                        {formatDayHeader(day.date, locale)}
                      </h2>
                      <span className="ml-auto flex gap-2">
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
                      </span>
                    </button>
                    {/* grid-template-rows 0fr/1fr 的经典技巧：纯 CSS 就能把
                        任意高度的内容平滑收起/展开，不需要量高度的 JS。 */}
                    <div
                      className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-in-out ${
                        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                      }`}
                    >
                      <div className="min-h-0 overflow-hidden">
                        {/* 跟主屏最近记录同一个处理：展开的那一天笔数多时，
                            让这个容器自己滚动，不要把整个页面撑高——用户
                            反馈的原话就是"应该和主页一样是一个可以滑动的
                            容器，而不是整个页面"。 */}
                        <ul className="max-h-64 overflow-y-auto rounded-lg border border-border bg-surface shadow-card">
                          {day.items.map((transaction) => (
                            <TransactionRow key={transaction.id} transaction={transaction} />
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>
                );
              })}
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