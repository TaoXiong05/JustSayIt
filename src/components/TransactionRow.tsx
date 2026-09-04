import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { locale } = useLocale();
  const sign = transaction.type === 'INCOME' ? '+' : '-';
  return (
    <li>
      <span>{transaction.merchant ?? '—'}</span>
      <span>{transaction.description}</span>
      {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
          本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持要求 §6、§7）*/}
      <span>{CATEGORY_LABELS[locale][transaction.category]}</span>
      <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
    </li>
  );
}
