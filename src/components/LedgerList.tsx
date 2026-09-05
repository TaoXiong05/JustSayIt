import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.date);
    if (list) list.push(t);
    else groups.set(t.date, [t]);
  }
  return [...groups.entries()];
}

export function LedgerList({ transactions }: { transactions: Transaction[] }) {
  const { t } = useLocale();
  if (transactions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface p-8 text-center text-sm text-muted">
        {t('emptyLedger')}
      </p>
    );
  }
  return (
    <div>
      {groupByDate(transactions).map(([date, items]) => (
        <section key={date} className="mb-4">
          {/* 主屏最近记录的外层容器是 max-h-64 overflow-y-auto（page.tsx）——
              日期标题吸顶，滚动明细时它不跟着滚走。背景色是必须的：sticky
              定住后下面滚上来的账目卡片会被它盖住，没有实色背景就会透出来
              叠在一起看不清。 */}
          <h2 className="sticky top-0 z-10 mb-1.5 bg-bg px-1 py-0.5 font-display text-sm font-semibold text-muted">
            {date}
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            {items.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
