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
            {/* 多币种时每段各自汇总，不做任何汇率换算——必须标出这一段是哪个
                币种，否则两段裸数字无从区分（金额本身不带货币符号，见
                TransactionRow.formatAmount）。 */}
            <h2>{currencyStats.currency}</h2>
            <ul>
              {currencyStats.expenseByCategory.map((cat) => {
                // 展开状态按「币种 + 分类」联合键存：同一个分类名（如 FOOD）
                // 可能同时出现在 AUD 段和 USD 段里，只按分类名存会让两段一起展开。
                const key = `${currencyStats.currency}:${cat.category}`;
                return (
                  <li key={key}>
                    <button type="button" onClick={() => setExpanded(expanded === key ? null : key)}>
                      {CATEGORY_LABELS[locale][cat.category]}
                    </button>
                    <span>{formatAmount(cat.totalCents, currencyStats.currency)}</span>
                    {expanded === key && (
                      <ul>
                        {cat.transactions.map((transaction) => (
                          <TransactionRow key={transaction.id} transaction={transaction} />
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
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
