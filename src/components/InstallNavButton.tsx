'use client';

import { Download } from 'lucide-react';
import { isIOS, isStandalone } from '@/lib/platform';
import { promptInstall } from '@/lib/pwa/install';
import { useInstallPromptState } from '@/lib/pwa/useInstallPromptState';
import { useLocale } from '@/lib/i18n/context';

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
 * installable 为 false 时点击只是安静地 no-op（promptInstall 内部判断
 * capturedEvent 为空就直接返回 'unavailable'），不会误导用户去一个自我循环
 * 的链接，也保留了"未登录/首次访问依然能看到安装入口"（这是 2026-09-08
 * 那次改动本来要解决的问题）——mounted 还是 false 的 SSR 首帧/客户端首次
 * 渲染，同样落在这个按钮分支，两边输出一致，不会 hydration mismatch。
 *
 * iOS 是唯一仍然链接去 /settings 的分支：iOS 没有 beforeinstallprompt API，
 * promptInstall() 在那上面永远只会是 no-op，settings 页的 InstallBanner 才
 * 有真正管用的"分享→添加到主屏幕"手动步骤。
 */
export function InstallNavButton() {
  const { t } = useLocale();
  const { mounted } = useInstallPromptState();

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

  return (
    <button type="button" onClick={() => void promptInstall()} className={className}>
      <Download aria-hidden="true" className="size-3.5" />
      {t('installNavButton')}
    </button>
  );
}
