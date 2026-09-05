'use client';

import { useState } from 'react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot as getSyncSnapshot, type SyncState } from '@/lib/sync/status';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';
import { EditForm } from '@/components/EditForm';

const EMPTY_SYNC_STATE: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { locale } = useLocale();
  const syncState = useSyncExternalStore(subscribe, getSyncSnapshot, () => EMPTY_SYNC_STATE);
  const synced = !syncState.unsyncedIds.includes(transaction.id);
  const isIncome = transaction.type === 'INCOME';
  const sign = isIncome ? '+' : '-';
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditForm
        transaction={transaction}
        onSave={(changes) => {
          void amendTransaction(transaction.id, changes);
          setEditing(false);
        }}
        onDelete={() => {
          void removeTransaction(transaction.id);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const CategoryIcon = CATEGORY_ICONS[transaction.category];

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        {/* 未同步/已同步的持久视觉标记（spec §8.5 第 1 点），零打扰、永久可见 */}
        <span aria-hidden="true" className={synced ? 'text-income' : 'text-expense'}>
          {synced ? '●' : '○'}
        </span>
        {/* 分类图标 + 文本标签并存——icon-only 无法为读屏器提供语义替代（Task 14） */}
        <CategoryIcon aria-hidden="true" className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {transaction.merchant ?? '—'}
          </span>
          <span className="block truncate text-xs text-muted">
            {transaction.description}
            {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
                本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持 §6、§7） */}
            <span className="ml-1.5 inline-flex rounded-full bg-surface-2 px-1.5 py-px text-[10px] font-medium">
              {CATEGORY_LABELS[locale][transaction.category]}
            </span>
          </span>
        </span>
        <span
          className={`shrink-0 font-mono tabular-nums text-sm font-medium ${
            isIncome ? 'text-income' : 'text-expense'
          }`}
        >
          {`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}
        </span>
      </button>
    </li>
  );
}
