'use client';

import { useState } from 'react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
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
  const sign = transaction.type === 'INCOME' ? '+' : '-';
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

  return (
    <li>
      <button type="button" onClick={() => setEditing(true)}>
        {/* 未同步/已同步的持久视觉标记（spec §8.5 第 1 点），零打扰、永久可见 */}
        <span aria-hidden="true">{synced ? '●' : '○'}</span>
        <span>{transaction.merchant ?? '—'}</span>
        <span>{transaction.description}</span>
        {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
            本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持要求 §6、§7）*/}
        <span>{CATEGORY_LABELS[locale][transaction.category]}</span>
        <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
      </button>
    </li>
  );
}
