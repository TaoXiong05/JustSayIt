import type { Transaction } from '@/lib/ai/schema';

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const sign = transaction.type === 'INCOME' ? '+' : '-';
  return (
    <li>
      <span>{transaction.merchant ?? '—'}</span>
      <span>{transaction.description}</span>
      <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
    </li>
  );
}
