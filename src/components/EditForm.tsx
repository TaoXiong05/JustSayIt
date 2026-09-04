'use client';

import { useState } from 'react';
import {
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
    <li>
      <label>
        {t('editCategoryLabel')}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryKey)}
        >
          {categoriesFor(transaction.type).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[locale][key]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('editAmountLabel')}
        <input
          type="text"
          inputMode="decimal"
          value={amountYuan}
          onChange={(e) => setAmountYuan(e.target.value)}
        />
      </label>
      <label>
        {t('editDateLabel')}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        {t('editMerchantLabel')}
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </label>
      <label>
        {t('editDescriptionLabel')}
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && <span role="alert">{error}</span>}
      <button type="button" onClick={handleSave}>
        {t('editSave')}
      </button>
      <button type="button" onClick={onCancel}>
        {t('editCancel')}
      </button>
      <button type="button" onClick={onDelete}>
        {t('editDelete')}
      </button>
    </li>
  );
}
