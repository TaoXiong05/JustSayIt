'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, classifyBTier, type SyncState } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';

const EMPTY: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/**
 * B 类分级预警（spec §8.4）+ A 类失败提示（spec §8.3）。
 * A 类失败（authError）不看时间，直接给出跟 >72h 模态一样的两个动作——
 * "重试同步"这里语义上是"重新走一次 syncNow，如果是授权问题会再次
 * 引导登录"（真正的重新登录跳转留给 Plan 4 的设置页，这里先把动作
 * 暴露出来，不阻塞本 Plan）。
 */
export function SyncWarning() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { t } = useLocale();
  const tier = classifyBTier(state);

  if (state.authError || tier === 'gt72h') {
    return (
      <div role="alertdialog">
        <p>{t('syncWarningModalTitle')}</p>
        <button type="button" onClick={() => void syncNow()}>
          {t('syncRetry')}
        </button>
        <button type="button" onClick={() => void exportBackup()}>
          {t('exportBackup')}
        </button>
      </div>
    );
  }

  if (tier === '24to72h') {
    return (
      <div role="status">
        <p>{t('syncWarningBanner')}</p>
      </div>
    );
  }

  return null;
}