'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, classifyBTier, type BTier, type SyncState } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';
import { isIOS, isStandalone } from '@/lib/platform';
import { shouldPrioritizeInstallGuidance } from '@/lib/pwa/install';
import { useToast } from '@/lib/toast';

const EMPTY: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/**
 * B 类分级预警（spec §8.4）+ A 类失败提示（spec §8.3）。
 *
 * Plan 5 Task 5 结构决策：
 * - **24–72h 档 → 警告 toast**（variant=warning + 重试动作）。这一档是柔和、可被打断的
 *   提醒，适合可滑动消除、自动关闭的 toast；持久可见指示仍由主屏的 SyncStatusDot 承担。
 * - **>72h 档与 A 类失败 → 内联警告卡**（保留 role=alertdialog 语义）：两个动作
 *   （重试同步/导出备份）、按设计需要常驻到问题解决，塞进 6 秒自动消失的 toast 会
 *   丢失这个「持续提醒直到处理」的语义，故不强行迁移。
 *
 * A 类失败（authError）不看时间，直接给出提示；但它的主动作不是"重试同步"——
 * drive-token 返回 DRIVE_REAUTH_REQUIRED/DRIVE_NOT_LINKED 时，旧 refresh
 * token 已经坏了（撤销/client 轮换/密钥轮换等），再跑一次 syncNow 只会
 * 拿到同样的 401，白等一次网络往返。真正能修好的是跳到 /api/auth/login?
 * reauth=1，强制走一遍 Google 的 consent 页换一个新 refresh token（见
 * oauth.ts buildAuthorizeUrl 的 forceConsent 注释）。
 */
export function SyncWarning() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { t } = useLocale();
  const { push } = useToast();
  const tier = classifyBTier(state);

  // isIOS()/isStandalone() 只有浏览器才答得出来，服务端渲染时永远是
  // false——nudgeInstall 直接进了下面 authError/gt72h 分支的 JSX，若不
  // 等 mounted 就用真实客户端结果，会跟服务端渲染出的 HTML 对不上，触发
  // hydration mismatch（跟 InstallBanner.tsx 同一类问题，那边先报出来了，
  // 这里是同一个根因，趁手一并修掉）。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // spec §8.8：「iOS + 未安装 + 有未同步数据」时把安装引导提升为高优先级。
  const nudgeInstall =
    mounted && shouldPrioritizeInstallGuidance({ hasUnsyncedData: state.unsyncedIds.length > 0 });

  // "可能被清除"仅 iOS + 未安装为真（spec §8.6）。这个值只在下面的
  // useEffect（toast 文案选择）里用到，effect 本来就只在客户端 mount 后
  // 跑，不参与 hydration 对比，不需要额外拿 mounted 门控。
  const iosAtRisk = isIOS() && !isStandalone();

  // 24–72h 档在「进入该档」时推一条警告 toast。用 ref 记录最后一次推送的档位，
  // 防止同档内因 t/iosAtRisk 等依赖变化重复推送叠出多条同内容的 toast。
  const pushedTierRef = useRef<BTier | null>(null);
  useEffect(() => {
    if (tier !== '24to72h') {
      pushedTierRef.current = null;
      return;
    }
    if (pushedTierRef.current === '24to72h') return;
    pushedTierRef.current = '24to72h';
    // syncWarningBannerIOS 的文案本身就是 §8.8 的那句引导（"…Add to Home Screen
    // to keep it safe."），不再额外追加 installNudgeUnsynced——把同一条建议说两遍没有意义。
    push({
      variant: 'warning',
      message: t(iosAtRisk ? 'syncWarningBannerIOS' : 'syncWarningBanner'),
      action: { label: t('syncRetry'), onClick: () => void syncNow() },
    });
  }, [tier, push, t, iosAtRisk]);

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