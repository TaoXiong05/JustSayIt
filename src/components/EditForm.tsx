'use client';

import { useState } from 'react';
import {
  DATE_PATTERN,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SHARED_CATEGORIES,
  isValidYuanAmount,
  toCents,
  type CategoryKey,
  type Transaction,
} from '@/lib/ai/schema';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/context';

function categoriesFor(type: Transaction['type']): readonly CategoryKey[] {
  return type === 'EXPENSE'
    ? [...EXPENSE_CATEGORIES, ...SHARED_CATEGORIES]
    : [...INCOME_CATEGORIES, ...SHARED_CATEGORIES];
}

/**
 * 行内展开的编辑表单（spec §13.2：原位展开，不用模态）。
 * 只改动过的字段才有意义上传，但这里为简单起见每次保存都带上全部
 * 五个可编辑字段的当前值——amendTransaction 的 changes 是
 * Partial<Omit<Transaction,'id'>>，全带上也完全合法，且避免"哪些字段
 * 被用户碰过"这层额外状态。
 */
export function EditForm({
  transaction,
  onSave,
  onDelete,
  onCancel,
}: {
  transaction: Transaction;
  onSave: (changes: Partial<Omit<Transaction, 'id'>>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState<CategoryKey>(transaction.category);
  const [amountYuan, setAmountYuan] = useState((transaction.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(transaction.date);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [description, setDescription] = useState(transaction.description);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsed = Number(amountYuan);
    if (!isValidYuanAmount(parsed)) {
      setError(t('editAmountInvalid'));
      return;
    }
    if (!DATE_PATTERN.test(date)) {
      setError(t('editDateInvalid'));
      return;
    }
    setError(null);
    onSave({
      category,
      amountCents: toCents(parsed),
      date,
      merchant: merchant.trim() === '' ? null : merchant,
      description,
    });
  }

  return (
    <li className="space-y-2.5 border-b border-border bg-surface-2/50 px-4 py-3 last:border-b-0">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editCategoryLabel')}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryKey)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {categoriesFor(transaction.type).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABELS[locale][key]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editAmountLabel')}
          <input
            type="text"
            inputMode="decimal"
            value={amountYuan}
            onChange={(e) => setAmountYuan(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 font-mono tabular-nums text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editDateLabel')}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editMerchantLabel')}
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
          {t('editDescriptionLabel')}
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm text-ink"
          />
        </label>
      </div>
      {error && (
        <span role="alert" className="block text-sm font-medium text-expense">
          {error}
        </span>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
        >
          {t('editSave')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('editCancel')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto rounded border border-expense-soft bg-expense-soft px-3 py-1.5 text-sm font-medium text-expense transition-colors hover:opacity-80"
        >
          {t('editDelete')}
        </button>
      </div>
    </li>
  );
}
