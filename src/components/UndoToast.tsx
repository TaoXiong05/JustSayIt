'use client';

import { useEffect } from 'react';
import { useToast } from '@/lib/toast';
import { useLocale } from '@/lib/i18n/context';

/**
 * 成功记账后的「已记 n 笔 + 撤销」Toast（Plan 5 Task 4：迁移到 Radix 原语）。
 * 组件自身不再渲染任何 DOM——把数据交给 useToast().push()，由全局 <Toaster />。
 *
 * page.tsx 沿用 `key={lastAdded.join(',')}` 的重新挂载纪律：一批新增对应一次
 * push()，Radix 按自己的内部 id 给每条 toast 独立的自动关闭计时器。重挂载是
 * 为了「同 length 的连续两批」也能各自触发一次 effect，从而各自推一条新 toast。
 */
export function UndoToast({
  count,
  unsyncedCount = 0,
  onUndo,
  onDismiss,
}: {
  count: number;
  unsyncedCount?: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const { push } = useToast();

  useEffect(() => {
    push({
      variant: 'success',
      message: t('undoneCount', { count, unsynced: unsyncedCount }),
      action: { label: t('undo'), onClick: onUndo },
      onDismiss,
    });
  }, [push, t, count, unsyncedCount, onUndo, onDismiss]);

  return null;
}
