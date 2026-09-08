'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { isIOS, isStandalone } from '@/lib/platform';
import { promptInstall } from '@/lib/pwa/install';
import { useInstallPromptState } from '@/lib/pwa/useInstallPromptState';
import { useLocale } from '@/lib/i18n/context';

/** 点击后反馈气泡自动消失的时长（同步 AddedFlash 的短暂瞬时提示观感）。 */
const TOAST_MS = 4000;

/**
 * 全局页眉里醒目的安装入口，接管原来长在这里的 SyncStatusDot 那个位置——
 * 同步状态跟"要不要装成 PWA"是两件不相关的事，同步状态挪去主屏"近期账单"
 * 标题旁边了（见 ledger/page.tsx），这里腾出来的位置留给真正只需要被看
 * 一次、但那一次必须显眼的安装入口。
 *
 * 点击的触发逻辑跟 settings 页 InstallBanner 的按钮完全一致——都是直接调用
 * promptInstall()，共用 useInstallPromptState()（mounted/installable 状态，
 * 见该文件注释）。曾经这里在"未捕获到 beforeinstallprompt"时会降级渲染一个
 * 指向 /settings 的链接：这条链接在 /settings 页自己点自己会触发整页刷新，
 * 刷新又会让 beforeinstallprompt 这个一次性事件永久丢失——看起来就是"点
 * Install 一直跳转 settings、永远弹不出安装框"（2026-09-08 回归）。
 *
 * 现在统一成：非 iOS 无条件渲染真正的安装按钮，不管 installable 与否——
 * installable 为 false 时点击仍会调用 promptInstall（它内部判断 capturedEvent
 * 为空就直接返回 'unavailable'），并按返回值冒泡反馈：'accepted' 提示安装
 * 已完成、'unavailable' 提示当前不可用（点击后短暂浮出的气泡，见下方实现）——
 * 不会误导用户去一个自我循环的链接，也保留了"未登录/首次访问依然能看到安装
 * 入口"（这是 2026-09-08 那次改动本来要解决的问题）——mounted 还是 false 的
 * SSR 首帧/客户端首次渲染，同样落在这个按钮分支，两边输出一致，不会
 * hydration mismatch。
 *
 * iOS 是唯一仍然链接去 /settings 的分支：iOS 没有 beforeinstallprompt API，
 * promptInstall() 在那上面永远只会是 no-op，settings 页的 InstallBanner 才
 * 有真正管用的"分享→添加到主屏幕"手动步骤。
 */
export function InstallNavButton() {
  const { t } = useLocale();
  const { mounted } = useInstallPromptState();
  // 点击 promptInstall() 后需要给用户明确反馈的结果档位（null = 不显示）。
  // 'accepted' = 用户在接受原生安装框时确认了安装 → 提示"安装已完成"；
  // 'unavailable' = 当前平台/浏览器没有派发过 beforeinstallprompt（桌面等）
  // → 提示"当前不可用"。'dismissed' 不放提示——那是用户主动取消的，不打扰。
  const [feedback, setFeedback] = useState<'accepted' | 'unavailable' | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时兜底清掉自动消失定时器，避免残留的 setState 打在已卸载的组件上。
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  if (mounted && isStandalone()) return null;

  const className =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:opacity-90';

  if (mounted && isIOS()) {
    return (
      <a href="/settings" className={className}>
        <Download aria-hidden="true" className="size-3.5" />
        {t('installNavButton')}
      </a>
    );
  }

  async function handleInstall() {
    const outcome = await promptInstall();
    if (outcome === 'dismissed') return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current); // 连续点击时重置倒计时
    setFeedback(outcome);
    hideTimerRef.current = setTimeout(() => setFeedback(null), TOAST_MS);
  }

  return (
    <>
      <button type="button" onClick={() => void handleInstall()} className={className}>
        <Download aria-hidden="true" className="size-3.5" />
        {t('installNavButton')}
      </button>
      {feedback && (
        <p
          role="status"
          className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4"
        >
          <span className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink shadow-pop">
            {feedback === 'accepted' ? t('installToastSuccess') : t('installToastUnavailable')}
          </span>
        </p>
      )}
    </>
  );
}
