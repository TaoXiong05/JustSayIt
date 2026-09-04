import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';

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
  if (transactions.length === 0) {
    return <p>还没有记录，说点什么试试。</p>;
  }
  return (
    <div>
      {groupByDate(transactions).map(([date, items]) => (
        <section key={date}>
          <h2>{date}</h2>
          <ul>
            {items.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
