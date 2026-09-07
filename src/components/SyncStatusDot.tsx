'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { subscribe, getSnapshot, EMPTY_SYNC_STATE } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { useLocale } from '@/lib/i18n/context';

/**
 * 成功闪光时长：转绿 + 小勾保持多久后回落中性"已同步"。绿色是瞬态不是常驻——
 * 常驻会跟金额列表"收入=绿"的语义混在一起（Global Constraint 1）。瞬态闪光则
 * 绕开了那个冲突：2 秒后回落到中性色，页面上不会长期存在一枚会让人误读成
 * "这笔是收入"的绿色徽标（token 见 globals.css 的 --success）。
 */
const SUCCESS_FLASH_MS = 2000;

/**
 * 主屏"近期账单"标题旁全局唯一一处同步状态点（spec §13.1 第 3 条）。四态，
 * 按优先级从高到低：**失败 → 同步中 → 待同步 → 已同步**。
 *
 * - 失败（lastError 非空）：红，圆点变形为 `!`（一次弹跳，不循环——循环会重蹈
 *   旧 `animate-pulse` 被用户反馈成"持续打扰"的覆辙），整体可点击，点击弹出
 *   失败详情卡片（popover）：原因 + 重试同步 + 已了解。
 * - 同步中（syncing）：小图标转圈（RefreshCw spin），文字"Syncing…"。仅在
 *   同步期间出现，结束后回落到待同步/已同步。
 * - 待同步（unsyncedIds>0）：琥珀 `●` + 数量。
 * - 已同步：中性色；每次同步成功（successTick 递增）瞬态转绿 + 小勾，约 2s 后
 *   回落中性。successTick 是"一次 runSyncOnce = +1"的粒度，所以一次批量同步（如
 *   一批 5 条账目）只闪一次，不会因每条 markSynced 而重复 5 次。
 *
 * 同步状态是独立于"收入/支出"的第三个维度——不能借用 income 表示"已同步"，
 * 否则一枚绿色徽标会和金额那边"收入=绿"的语义混在一起（Global Constraint 1）。
 * 已同步用中性色，待同步保留 warning 琥珀色，成功闪光是唯一的、时间受限的绿。
 *
 * 移动端紧凑：窄屏（md 以下）徽标只保留图标/数字，文字进 `md:inline`，配合
 * 标题行左侧容器的 min-w-0（见 page.tsx）——"近期账单"标题行不会因徽标文字被
 * 撑开、右侧"查看全部历史"也不会被挤掉（用户反馈：文字太多把移动端容器撑开了）。
 * 完整语义由 aria-label/title 携带，屏幕阅读器和 hover 都不丢。
 */
export function SyncStatusDot() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SYNC_STATE);
  const { t } = useLocale();
  const [flashing, setFlashing] = useState(false);
  const [showFailure, setShowFailure] = useState(false);
  // 记录上一次消费过的 successTick：只有 tick 变大（一次新的同步成功）才重播
  // 闪光。用 ref 而非 state，因为判断"变了没"不需要靠它本身触发渲染。
  const lastSeenTick = useRef(state.successTick);

  useEffect(() => {
    if (state.successTick > lastSeenTick.current) {
      lastSeenTick.current = state.successTick;
      setFlashing(true);
      const timer = setTimeout(() => setFlashing(false), SUCCESS_FLASH_MS);
      return () => clearTimeout(timer);
    }
  }, [state.successTick]);

  // Esc 关闭失败详情——跟 backdrop 点击、卡片里"已了解"是三个并列关闭入口。
  useEffect(() => {
    if (!showFailure) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowFailure(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFailure]);

  const failed = Boolean(state.lastError);
  const syncing = state.syncing;
  const pending = state.unsyncedIds.length > 0;
  const stateName = failed ? 'failed' : syncing ? 'syncing' : pending ? 'pending' : 'synced';
  // 完整（桌面）语义文案，也作为读屏的 aria-label 后备。
  const longLabel = syncing
    ? t('syncing')
    : pending
      ? t('syncPendingCount', { count: state.unsyncedIds.length })
      : t('syncedUpToDate');

  const badgeCls = `min-w-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
    failed
      ? 'bg-danger-soft text-danger'
      : syncing
        ? 'bg-brand-soft text-brand'
        : pending
          ? 'bg-warning-soft text-warning'
          : flashing
            ? 'bg-success-soft text-success [animation:sync-success-pop_0.5s_ease-out_forwards]'
            : 'bg-surface-2 text-muted'
  }`;

  return (
    <>
      {/* 失败态整枚徽标是按钮（点击弹失败详情），其余状态是不可交互的中性徽标。 */}
      {failed ? (
        <button
          type="button"
          onClick={() => setShowFailure(true)}
          aria-expanded={showFailure}
          aria-haspopup="dialog"
          title={t('syncLastError', { message: state.lastError as string })}
          data-state={stateName}
          className={`relative ${badgeCls}`}
        >
          <span
            aria-hidden="true"
            className="text-base leading-none [animation:sync-fail-pop_0.6s_ease-out_forwards]"
          >
            !
          </span>
          <span className="hidden md:inline">{t('syncFailedShort')}</span>
        </button>
      ) : (
        <span
          role="status"
          aria-live="polite"
          aria-label={longLabel}
          title={state.lastError ? t('syncLastError', { message: state.lastError }) : undefined}
          data-state={stateName}
          className={`relative ${badgeCls}`}
        >
          {syncing ? (
            <RefreshCw aria-hidden="true" className="size-3.5 animate-spin" />
          ) : flashing ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <span aria-hidden="true" className="leading-none">●</span>
          )}
          {syncing ? (
            <span className="hidden md:inline">{t('syncing')}</span>
          ) : pending ? (
            <>
              {/* 移动端只保留数字免得撑开标题行容器；桌面端显示"N 笔待同步"。 */}
              <span className="md:hidden">{state.unsyncedIds.length}</span>
              <span className="hidden md:inline">
                {t('syncPendingCount', { count: state.unsyncedIds.length })}
              </span>
            </>
          ) : (
            <span>{t('syncedUpToDate')}</span>
          )}
        </span>
      )}

      {showFailure && failed && (
        <>
          {/* backdrop：点击徽标外任意处关闭。fixed 铺满、透明、不挡读屏。 */}
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setShowFailure(false)}
          />
          <div
            role="dialog"
            aria-label={t('syncFailedShort')}
            className="absolute left-0 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-surface px-3 py-2.5 text-sm text-ink shadow-pop"
          >
            <p className="font-medium text-danger">{t('syncFailedShort')}</p>
            <p className="mt-1 break-words text-muted">{state.lastError}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {/* 复用 engine 的 syncNow：成功后 lastError 被清空，failed 翻回
                  false，这个 popover 和红色徽标会自动一起消失。 */}
              <button
                type="button"
                onClick={() => void syncNow()}
                className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-brand-ink transition-colors hover:opacity-90"
              >
                {t('syncRetry')}
              </button>
              <button
                type="button"
                onClick={() => setShowFailure(false)}
                className="rounded border border-border px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2"
              >
                {t('syncDismiss')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}