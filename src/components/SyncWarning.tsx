'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, classifyBTier, EMPTY_SYNC_STATE } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';
import { shouldPrioritizeInstallGuidance } from '@/lib/pwa/install';

/**
 * B 类分级预警（spec §8.4）+ A 类失败提示（spec §8.3）。
 *
 * - **24–72h 档 → 不额外弹提示**：这一档只靠主屏 SyncStatusDot 常驻的
 *   待同步计数体现（用户反馈：那个圆点已经一直在显示了，再弹一次是
 *   重复打扰，去掉）。
 * - **>72h 档与 A 类失败 → 内联警告卡**（role=alertdialog）：两个动作
 *   （重试同步/导出备份），常驻到问题解决。
 *
 * A 类失败（authError）不看时间，直接给出提示；但它的主动作不是"重试同步"——
 * drive-token 返回 DRIVE_REAUTH_REQUIRED/DRIVE_NOT_LINKED 时，旧 refresh
 * token 已经坏了（撤销/client 轮换/密钥轮换等），再跑一次 syncNow 只会
 * 拿到同样的 401，白等一次网络往返。真正能修好的是跳到 /api/auth/login?
 * reauth=1，强制走一遍 Google 的 consent 页换一个新 refresh token（见
 * oauth.ts buildAuthorizeUrl 的 forceConsent 注释）。
 */
export function SyncWarning() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SYNC_STATE);
  const { t } = useLocale();
  const tier = classifyBTier(state);

  // shouldPrioritizeInstallGuidance() 内部会问 isIOS()/isStandalone()，
  // 只有浏览器才答得出来，服务端渲染时永远是 false——nudgeInstall 直接
  // 进了下面 authError/gt72h 分支的 JSX，若不等 mounted 就用真实客户端
  // 结果，会跟服务端渲染出的 HTML 对不上，触发 hydration mismatch
  // （跟 InstallBanner.tsx 同一类问题，那边先报出来了，这里是同一个
  // 根因，趁手一并修掉）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // spec §8.8：「iOS + 未安装 + 有未同步数据」时把安装引导提升为高优先级。
  const nudgeInstall =
    mounted && shouldPrioritizeInstallGuidance({ hasUnsyncedData: state.unsyncedIds.length > 0 });

  if (state.authError || tier === 'gt72h') {
    return (
      <div
        role="alertdialog"
        className="rounded-lg border border-l-4 border-l-warning border-border bg-warning-soft p-4"
      >
        <p className="text-sm font-semibold text-ink">{t('syncWarningModalTitle')}</p>
        {nudgeInstall && <p className="mt-1 text-sm text-ink">{t('installNudgeUnsynced')}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {state.authError ? (
            <a
              href="/api/auth/login?reauth=1"
              className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
            >
              {t('syncReconnect')}
            </a>
          ) : (
            <button
              type="button"
              onClick={() => void syncNow()}
              className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
            >
              {t('syncRetry')}
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportBackup()}
            className="rounded border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          >
            {t('exportBackup')}
          </button>
        </div>
      </div>
    );
  }

  return null;
}