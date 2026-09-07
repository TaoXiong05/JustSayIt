'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
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

/**
 * 表单控件的统一尺寸。两个数字都是硬要求，不是审美：
 * - h-12（48px）：原来是 py-1.5 撑出的 33px，实测低于 Apple HIG 的 44px
 *   和 Material 的 48px，"不好点"就是这么来的。
 * - text-base（16px）：iOS Safari 在聚焦**字号小于 16px** 的输入框时会
 *   自动放大整个页面，放大后页面不会自己缩回去，用户得手动双指缩放——
 *   原来的 text-sm（14px）每次点输入框都触发一次。这一条只有 16px 能解，
 *   不是调 padding 能绕过去的。
 */
const FIELD_CLASS =
  'h-12 w-full rounded-lg border border-border bg-surface px-3 text-base text-ink focus:border-brand focus:outline-none';

function categoriesFor(type: Transaction['type']): readonly CategoryKey[] {
  return type === 'EXPENSE'
    ? [...EXPENSE_CATEGORIES, ...SHARED_CATEGORIES]
    : [...INCOME_CATEGORIES, ...SHARED_CATEGORIES];
}

/**
 * 编辑表单本体——原先是原位展开（spec §13.2），Plan 5 二次改版按明确要求
 * 换成了居中弹窗（见 EditDialog.tsx），这里只是表单内容，不关心自己被
 * 谁包着。只改动过的字段才有意义上传，但这里为简单起见每次保存都带上全部
 * 五个可编辑字段的当前值——amendTransaction 的 changes 是
 * Partial<Omit<Transaction,'id'>>，全带上也完全合法，且避免"哪些字段
 * 被用户碰过"这层额外状态。
 */
export function EditForm({
  transaction,
  onSave,
  onDelete,
}: {
  transaction: Transaction;
  onSave: (changes: Partial<Omit<Transaction, 'id'>>) => void;
  onDelete: () => void;
}) {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState<CategoryKey>(transaction.category);
  const [amountYuan, setAmountYuan] = useState((transaction.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(transaction.date);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [description, setDescription] = useState(transaction.description);
  const [error, setError] = useState<string | null>(null);
  // 删除的二次确认。原地展开而不是再叠一层弹窗——移动端弹窗上叠弹窗很糟，
  // 且这里要的只是"多一步"，不需要一个新的模态层级。
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editCategoryLabel')}
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CategoryKey)}
            className={FIELD_CLASS}
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
            className={`${FIELD_CLASS} font-mono tabular-nums`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editDateLabel')}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('editMerchantLabel')}
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
          {t('editDescriptionLabel')}
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={FIELD_CLASS}
          />
        </label>
      </div>
      {error && (
        <span role="alert" className="block text-sm font-medium text-danger">
          {error}
        </span>
      )}
      {/* 主操作：全宽 48px。原来 Save 在左下角（单手持机最难够到的位置），
          而 Delete 靠 ml-auto 钉在右下角——拇指的自然落点。位置正好反了，
          这是"很容易误点 DELETE"最直接的成因。现在主操作横跨整个拇指区，
          删除入口挪到下面、且要两步。
          文字版 Cancel 一并去掉：取消有遮罩、Escape 和头部那个 44px 的 X
          三条路，底部再放一个只会跟 Save 抢位置、又把主按钮挤窄。 */}
      <button
        type="button"
        onClick={handleSave}
        className="h-12 w-full rounded-xl bg-brand text-base font-semibold text-brand-ink transition-opacity hover:opacity-90"
      >
        {t('editSave')}
      </button>

      {/* 删除区：跟主操作之间有分隔线和留白，物理上离 Save 尽量远。
          撤销入口是明确要求去掉的（见 AddedFlash.tsx），所以删除在 UI 上
          不可挽回——那就必须在按下之前拦一道，而不是按下之后给后悔药。 */}
      <div className="border-t border-border pt-3">
        {confirmingDelete ? (
          <div className="rounded-xl border border-danger-soft bg-danger-soft p-3">
            <p className="text-sm font-medium text-danger">{t('editDeleteConfirm')}</p>
            <div className="mt-3 flex gap-2">
              {/* autoFocus 落在**取消**上，两个原因：
                  1. 破坏性确认的默认焦点应该是安全的那一个，回车不该删东西。
                  2. 点删除入口时那个按钮本身被替换掉了，焦点会掉回 Dialog
                     容器上——容器带 tabindex="-1"，于是整个 sheet 外面画出
                     一圈焦点环，看着像坏了。把焦点接住就没有这个问题。 */}
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmingDelete(false)}
                className="h-11 flex-1 rounded-lg border border-border bg-surface text-sm font-medium text-ink transition-colors hover:bg-surface-2"
              >
                {t('editCancel')}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="h-11 flex-1 rounded-lg bg-danger text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {t('editDelete')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="mx-auto flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:text-danger"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t('editDelete')}
          </button>
        )}
      </div>
    </div>
  );
}
