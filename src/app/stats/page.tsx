'use client';

import { useMemo, useState } from 'react';
import { useLedger } from '@/lib/ledger/useLedger';
import { computeStats } from '@/lib/ledger/stats';
import { TransactionRow, formatAmount } from '@/components/TransactionRow';
import { MonthSwitcher, useMonthNav } from '@/components/MonthSwitcher';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';
import { useLocale } from '@/lib/i18n/context';

export default function StatsPage() {
  const ledger = useLedger();
  const { t, locale } = useLocale();
  const nav = useMonthNav(ledger.transactions);
  const [expanded, setExpanded] = useState<string | null>(null);

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // 只有月口径（Plan 5 Task 11：week 模式已删除），referenceDate 由共享的
  // MonthSwitcher 的 month 状态驱动。
  const stats = useMemo(
    () => computeStats(ledger.transactions, nav.month, timeZone),
    [ledger.transactions, nav.month, timeZone],
  );

  const switcher = (
    <MonthSwitcher
      month={nav.month}
      onChange={nav.setMonth}
      earliestMonth={nav.earliestMonth}
    />
  );

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-5xl lg:pb-6">
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold text-ink">{t('navStats')}</h1>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_300px] lg:items-start lg:gap-6">
        <div>
          {/* 移动端月份切换在列表上方 */}
          <div className="mb-4 lg:hidden">{switcher}</div>

          {stats.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
              {t('statsEmpty')}
            </p>
          ) : (
            stats.map((currencyStats) => (
              <section
                key={currencyStats.currency}
                className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card"
              >
                {/* 多币种时每段各自汇总，不做任何汇率换算——必须标出这一段是哪个
                    币种，否则两段裸数字无从区分（金额本身不带货币符号）。 */}
                <h2 className="font-display text-sm font-semibold text-ink">
                  {currencyStats.currency}
                </h2>
                <ul className="mt-2 divide-y divide-border">
                  {currencyStats.expenseByCategory.map((cat) => {
                    const CategoryIcon = CATEGORY_ICONS[cat.category];
                    // 展开状态按「币种 + 分类」联合键存：同一个分类名（如 FOOD）
                    // 可能同时出现在 AUD 段和 USD 段里，只按分类名存会让两段一起展开。
                    const key = `${currencyStats.currency}:${cat.category}`;
                    const open = expanded === key;
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : key)}
                          aria-expanded={open}
                          className="flex w-full items-center gap-3 py-2.5 text-left"
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                            <CategoryIcon aria-hidden="true" className="size-4" />
                          </span>
                          <span className="flex-1 text-sm font-medium text-ink">
                            {CATEGORY_LABELS[locale][cat.category]}
                          </span>
                          <span className="font-mono tabular-nums text-sm text-ink">
                            {formatAmount(cat.totalCents, currencyStats.currency)}
                          </span>
                        </button>
                        {open && (
                          <ul className="ml-11 mb-1 space-y-0.5">
                            {cat.transactions.map((transaction) => (
                              <TransactionRow key={transaction.id} transaction={transaction} />
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  <p className="flex justify-between gap-3 text-muted">
                    <span>{t('statsTotalExpense')}</span>
                    <span className="font-mono tabular-nums font-medium text-ink">
                      {formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}
                    </span>
                  </p>
                  <p className="flex justify-between gap-3 text-muted">
                    <span>{t('statsTotalIncome')}</span>
                    <span className="font-mono tabular-nums font-medium text-income">
                      {formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}
                    </span>
                  </p>
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="hidden lg:sticky lg:top-6 lg:block">
          <div className="space-y-4">
            {switcher}
            {stats.map((currencyStats) => (
              <section
                key={currencyStats.currency}
                className="rounded-lg border border-border bg-surface p-4 shadow-card"
              >
                {/* 与左栏段标题（纯 AUD）不同的全文本，保证 getByText('AUD')
                    仍唯一命中——测试无需为两个断点重复文本做消歧。 */}
                <h3 className="font-display text-sm font-semibold text-ink">
                  {currencyStats.currency} · {t('statsMonthSummary')}
                </h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('statsTotalExpense')}</dt>
                    <dd className="font-mono tabular-nums text-ink">
                      {formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('statsTotalIncome')}</dt>
                    <dd className="font-mono tabular-nums text-income">
                      {formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}
                    </dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
