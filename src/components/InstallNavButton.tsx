'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';
import { useLocale } from '@/lib/i18n/context';

/**
 * 全局页眉里醒目的安装入口，接管原来长在这里的 SyncStatusDot 那个位置——
 * 同步状态跟"要不要装成 PWA"是两件不相关的事，同步状态挪去主屏"近期账单"
 * 标题旁边了（见 ledger/page.tsx），这里腾出来的位置留给真正只需要被看
 * 一次、但那一次必须显眼的安装入口。
 *
 * **首帧即渲染、不依赖登录态。** 曾经的写法是 `if (!mounted) return null`：
 * 服务端渲染/未登录用户初次访问时，安装入口完全不出现（用户反馈原话：
 * "用户初次访问页面，没有登录就看不到 install 按钮"）。这里有意让
 * SSR 首帧就渲染**降级成 `/settings` 链接**的安装入口——这恰好也和客户端
 * 首次渲染一致，不引入 hydration mismatch：
 * - SSR（mounted=false）→ 渲染 `/settings` 链接。
 * - 客户端首次渲染（mounted 仍为 false）→ 同一份链接，两边一致。
 * - effect 之后 mounted=true → 再按真实环境切换成原生按钮、或（已安装
 *   standalone）隐藏。这一步是纯客户端更新，不会 mismatch。
 *
 * 安装入口的"降级"规则：
 * - 已安装到主屏幕（isStandalone）→ 不渲染（客户端 mounted 后才知道）。
 * - Android/Chrome 捕获到 beforeinstallprompt → 原生安装按钮（promptInstall）。
 * - iOS → 链接到 /settings（那里有手动"添加到主屏幕"步骤）。
 * - 其它浏览器（桌面、或 Chrome 处于"已安装过又卸载"的冷却期，不派发
 *   beforeinstallprompt）→ 同样降级成 /settings 链接，**而不是隐藏**。
 *
 * 曾经"没捕获到事件就不渲染"：Chrome 在用户卸载过同一个 PWA 后会在很长
 * 一段时间内不再派发 beforeinstallprompt（防骚扰的冷却机制），于是安装入口
 * 在"卸载过"之后永久消失，用户再想装回来根本找不到入口。安装入口不该依赖
 * 那一次性的派发——"这个浏览器可不可装"跟"这次有没有派发事件"是两回事，
 * 后者会漏掉大量真实可安装场景。降到 /settings 链接保留入口，同时完全不动
 * Android Chrome 的原生安装体验。
 */
export function InstallNavButton() {
  const { t } = useLocale();
  const [mounted, setMounted] = useState(false);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstallable(canPromptInstall());
    // 见 InstallBanner.tsx 同一处注释：beforeinstallprompt 的捕获早于这个
    // 组件挂载就已经完成，这里只需要轮询一次挂载后的结果。
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => clearInterval(id);
  }, []);

  const className =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:opacity-90';

  // 已安装到主屏幕时，客户端 mounted 后才判定得到，这时才真正隐藏。
  if (mounted && isStandalone()) return null;

  // SSR / 客户端首次渲染 / iOS / 未捕获到事件：统一降级成 /settings 链接。
  // mounted=false（SSR 首帧）也走这里，保证首次访问就有安装入口。
  // iOS 没有 beforeinstallprompt 只能手动引导；非 iOS 但没捕获到事件
  // （卸载后的冷却期、桌面/非 Chrome）同样降级，入口不因"这次没派发事件"
  // 而消失。
  if (!mounted || isIOS() || !installable) {
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
