'use client';

import { useMemo, useState } from 'react';
import { useLedger } from '@/lib/ledger/useLedger';
import { computeStats, type StatsPeriod } from '@/lib/ledger/stats';
import { TransactionRow, formatAmount } from '@/components/TransactionRow';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/context';

export default function StatsPage() {
  const ledger = useLedger();
  const { t, locale } = useLocale();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [expanded, setExpanded] = useState<string | null>(null);

  // referenceDate 用当前时刻即可——用户切"上一周/下一周"不在本 Plan 范围
  // （spec §3 明确"不做...任意区间"，MVP 只看当前周期）
  const stats = useMemo(
    () =>
      computeStats(
        ledger.transactions,
        period,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    [ledger.transactions, period],
  );

  return (
    <main>
      <div>
        <button type="button" onClick={() => setPeriod('week')} aria-pressed={period === 'week'}>
          {t('statsTabWeek')}
        </button>
        <button type="button" onClick={() => setPeriod('month')} aria-pressed={period === 'month'}>
          {t('statsTabMonth')}
        </button>
      </div>
      {stats.length === 0 ? (
        <p>{t('statsEmpty')}</p>
      ) : (
        stats.map((currencyStats) => (
          <section key={currencyStats.currency}>
            <ul>
              {currencyStats.expenseByCategory.map((cat) => (
                <li key={cat.category}>
                  <button type="button" onClick={() => setExpanded(expanded === cat.category ? null : cat.category)}>
                    {CATEGORY_LABELS[locale][cat.category]}
                  </button>
                  <span key={`amount-${cat.category}`}>{formatAmount(cat.totalCents, currencyStats.currency)}</span>
                  {expanded === cat.category && (
                    <ul>
                      {cat.transactions.map((transaction) => (
                        <TransactionRow key={transaction.id} transaction={transaction} />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p>
              {t('statsTotalExpense')}: <span>{formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}</span>
            </p>
            <p>
              {t('statsTotalIncome')}: <span>{formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}</span>
            </p>
          </section>
        ))
      )}
    </main>
  );
}
