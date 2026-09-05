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

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-2xl lg:pb-6">
      {/* 三页统一的话术标语风格（Ledger/History/Stats），见 page.tsx 的
          注释——排版专为多行句子调过。 */}
      <header className="mb-5">
        <h1 className="text-center font-display text-lg font-bold leading-snug text-ink sm:text-xl">
          {t('statsTagline')}
        </h1>
      </header>

      {/* 月份切换放最上面，所有断点通用——不再是"移动端在列表上方、
          桌面端挪进侧边栏"两份，就一份。 */}
      <div className="mb-4">
        <MonthSwitcher month={nav.month} onChange={nav.setMonth} earliestMonth={nav.earliestMonth} />
      </div>

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
                      {/* expenseByCategory 顾名思义全是支出，跟 Total spent
                          同一套方向配色/负号约定，不需要按符号分叉判断。 */}
                      <span className="font-mono tabular-nums text-sm text-expense">
                        {`-${formatAmount(cat.totalCents, currencyStats.currency)}`}
                      </span>
                    </button>
                    {open && (
                      // 跟主屏最近记录、History 展开天同一个处理：分类下
                      // 笔数多时容器自己滚动，不要把整个页面撑高。
                      <ul className="ml-11 mb-1 max-h-64 space-y-0.5 overflow-y-auto">
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
                <span className="font-mono tabular-nums font-medium text-expense">
                  {`-${formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}`}
                </span>
              </p>
              <p className="flex justify-between gap-3 text-muted">
                <span>{t('statsTotalIncome')}</span>
                <span className="font-mono tabular-nums font-medium text-income">
                  {formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}
                </span>
              </p>
              {/* 结余 = 收入 - 支出，跟账目行同一套方向配色/正负号约定
                  （Global Constraint 1：income/expense 只用于金额方向着色，
                  结余本身就是一个有方向的金额，套用同一规则是一致的）。 */}
              {(() => {
                const balanceCents = currencyStats.totalIncomeCents - currencyStats.totalExpenseCents;
                const isPositive = balanceCents >= 0;
                return (
                  <p className="flex justify-between gap-3 text-muted">
                    <span>{t('statsBalance')}</span>
                    <span
                      className={`font-mono tabular-nums font-medium ${isPositive ? 'text-income' : 'text-expense'}`}
                    >
                      {`${isPositive ? '+' : '-'}${formatAmount(Math.abs(balanceCents), currencyStats.currency)}`}
                    </span>
                  </p>
                );
              })()}
            </div>
          </section>
        ))
      )}

      {/* 月度总览挪到页面最下面，不再是桌面端才有的侧边栏——所有断点都
          显示（History 的 Net by currency 也是同样处理）。标题保留跟上面
          分类段（纯 {currency}）不同的全文本，两块同时在 DOM 里时
          getByText(currency) 依然只命中一个。 */}
      {stats.map((currencyStats) => (
        <section
          key={currencyStats.currency}
          className="mb-4 rounded-lg border border-border bg-surface p-4 shadow-card"
        >
          <h3 className="font-display text-sm font-semibold text-ink">
            {currencyStats.currency} · {t('statsMonthSummary')}
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('statsTotalExpense')}</dt>
              <dd className="font-mono tabular-nums text-expense">
                {`-${formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}`}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t('statsTotalIncome')}</dt>
              <dd className="font-mono tabular-nums text-income">
                {formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}
              </dd>
            </div>
            {(() => {
              const balanceCents = currencyStats.totalIncomeCents - currencyStats.totalExpenseCents;
              const isPositive = balanceCents >= 0;
              return (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">{t('statsBalance')}</dt>
                  <dd className={`font-mono tabular-nums ${isPositive ? 'text-income' : 'text-expense'}`}>
                    {`${isPositive ? '+' : '-'}${formatAmount(Math.abs(balanceCents), currencyStats.currency)}`}
                  </dd>
                </div>
              );
            })()}
          </dl>
        </section>
      ))}
    </main>
  );
}
