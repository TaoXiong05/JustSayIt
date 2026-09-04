'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, type SyncState } from '@/lib/sync/status';
import { useLocale } from '@/lib/i18n/context';

const EMPTY: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/**
 * 主屏左上角全局唯一一处同步状态点（spec §13.1 第 3 条）：
 * 一个数字，零打扰，永久可见。分级预警（横幅/模态）在 Task 14 里
 * 是单独的组件，只在超过阈值时才叠加出现，不在这里画。
 */
export function SyncStatusDot() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { t } = useLocale();
  return (
    <span role="status">
      {state.unsyncedIds.length > 0
        ? t('syncPendingCount', { count: state.unsyncedIds.length })
        : t('syncedUpToDate')}
    </span>
  );
}