'use client';

import { useState } from 'react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';
import { CATEGORY_TINTS } from '@/lib/i18n/categoryTint';
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot as getSyncSnapshot, EMPTY_SYNC_STATE } from '@/lib/sync/status';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';
import { EditDialog } from '@/components/EditDialog';

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
  const CategoryIcon = CATEGORY_ICONS[transaction.category];
  const tint = CATEGORY_TINTS[transaction.category];

  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2"
      >
        {/* 未同步/已同步的持久视觉标记（spec §8.5 第 1 点），零打扰、永久可见。
            用中性色/warning，不用 income/expense——同步状态和这笔账是收入
            还是支出是两回事，一个未同步的收入不该在这里显示成"支出红"
            （Global Constraint 1：income/expense 只用于金额方向着色）。 */}
        <span aria-hidden="true" className={synced ? 'text-muted' : 'text-warning'}>
          {synced ? '●' : '○'}
        </span>
        {/* 分类头像方块（参考设计）：按分类循环分配的装饰色，跟 income/expense/
            brand 语义色完全脱钩（见 categoryTint.ts）。图标 + 文本标签并存——
            icon-only 无法为读屏器提供语义替代（Task 14）。 */}
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tint.bg}`}
        >
          <CategoryIcon className={`size-5 ${tint.fg}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {transaction.merchant ?? '—'}
          </span>
          {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
              本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持 §6、§7）。
              参考设计里这行是纯文本 + 项目符号分隔，不是徽章 chip。 */}
          <span className="block truncate text-xs text-muted">
            {transaction.description} · {CATEGORY_LABELS[locale][transaction.category]}
          </span>
        </span>
        <span
          className={`shrink-0 font-mono tabular-nums text-[15px] font-semibold ${
            isIncome ? 'text-income' : 'text-expense'
          }`}
        >
          {`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}
        </span>
      </button>
      <EditDialog
        open={editing}
        onOpenChange={setEditing}
        transaction={transaction}
        onSave={(changes) => void amendTransaction(transaction.id, changes)}
        onDelete={() => void removeTransaction(transaction.id)}
      />
    </li>
  );
}
