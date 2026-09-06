'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, EMPTY_SYNC_STATE } from '@/lib/sync/status';
import { useLocale } from '@/lib/i18n/context';

/**
 * 主屏左上角全局唯一一处同步状态点（spec §13.1 第 3 条）：
 * 一个数字，零打扰，永久可见。分级预警（横幅/模态）在 Task 14 里
 * 是单独的组件，只在超过阈值时才叠加出现，不在这里画。
 */
export function SyncStatusDot() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SYNC_STATE);
  const { t } = useLocale();
  const pending = state.unsyncedIds.length > 0;
  return (
    <span
      role="status"
      // 上一次同步尝试失败时把原因挂上来——在这之前"还没试"和"试了但失败"
      // 在界面上完全一样，只剩一个不消失的"待同步"（见 sync/status.ts 里
      // lastError 的说明）。失败详情同时会打进 console。
      title={state.lastError ? t('syncLastError', { message: state.lastError }) : undefined}
      // 同步状态是独立于"收入/支出"的第三个维度——不能借用 income 表示
      // "已同步"，否则一枚绿色徽标会和金额那边"收入=绿"的语义混在一起
      // （Global Constraint 1）。已同步用中性色，待同步保留 warning 琥珀色。
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        pending ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-muted'
      }`}
    >
      <span aria-hidden="true" className={pending ? 'animate-pulse' : ''}>●</span>
      {pending
        ? t('syncPendingCount', { count: state.unsyncedIds.length })
        : t('syncedUpToDate')}
    </span>
  );
}