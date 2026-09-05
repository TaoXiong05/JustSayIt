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
          <h2 className="mb-1.5 px-1 font-display text-sm font-semibold text-muted">{date}</h2>
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
