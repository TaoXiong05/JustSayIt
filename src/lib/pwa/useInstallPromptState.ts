'use client';

import { useEffect, useState } from 'react';
import { canPromptInstall } from '@/lib/pwa/install';

/**
 * 安装相关的可复用客户端状态：mounted（服务端渲染/客户端首次渲染时固定为
 * false，避免两边输出不一致触发的 hydration mismatch）+ installable（是否
 * 已经捕获到 beforeinstallprompt，轮询 canPromptInstall() 读取——事件本身在
 * 应用外壳层的 PersistStorageOnMount 里捕获，见 lib/pwa/install.ts）。
 *
 * InstallNavButton 和 InstallBanner 曾经各自维护一份几乎相同的这段逻辑，
 * 独立演化导致其中一份改动时另一份没跟着同步——这正是 2026-09-08 那次回归
 * （导航栏 Install 降级成会自我循环刷新的 /settings 链接）的直接成因，
 * 抽成共享实现后两处不会再分叉。
 */
export function useInstallPromptState(): { mounted: boolean; installable: boolean } {
  const [mounted, setMounted] = useState(false);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstallable(canPromptInstall());
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => clearInterval(id);
  }, []);

  return { mounted, installable };
}
