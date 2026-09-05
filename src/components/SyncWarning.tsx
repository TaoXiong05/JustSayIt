'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, classifyBTier, type SyncState } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';
import { isIOS, isStandalone } from '@/lib/platform';
import { shouldPrioritizeInstallGuidance } from '@/lib/pwa/install';

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

  // spec §8.8：「iOS + 未安装 + 有未同步数据」时把安装引导提升为高优先级。
  // 用户此刻刚看到"尚未同步"的预警，正处在能听进去的情境里，所以把这句引导
  // 挂在已经在显示的预警上，而不是另起一个独立横幅去抢注意力。
  const nudgeInstall = shouldPrioritizeInstallGuidance({
    hasUnsyncedData: state.unsyncedIds.length > 0,
  });

  if (state.authError || tier === 'gt72h') {
    return (
      <div role="alertdialog">
        <p>{t('syncWarningModalTitle')}</p>
        {nudgeInstall && <p>{t('installNudgeUnsynced')}</p>}
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
    // "可能被清除"仅 iOS + 未安装为真（spec §8.6）；已安装的 iOS PWA
    // 有 ITP 豁免，其它平台用更温和的"尚未备份"，避免制造不必要的焦虑。
    const iosAtRisk = isIOS() && !isStandalone();
    // 注意这里 **不** 再追加 installNudgeUnsynced：进到 24to72h 这一档必然
    // unsyncedIds.length > 0，所以 iosAtRisk 与 nudgeInstall 在这个分支里恒等，
    // 而 syncWarningBannerIOS 的文案本身就已经是 §8.8 的那句引导
    // （"…Add to Home Screen to keep it safe."）。再挂一句就是把同一条建议
    // 原地说两遍。§8.8 的提权在下面那个模态分支里才真正补上了信息
    // （模态文案是通用的，不含任何安装引导）。
    return (
      <div role="status">
        <p>{t(iosAtRisk ? 'syncWarningBannerIOS' : 'syncWarningBanner')}</p>
      </div>
    );
  }

  return null;
}