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
 * mounted 门控原因跟 InstallBanner.tsx 一致：isIOS/isStandalone/
 * canPromptInstall 只有客户端才答得出来，服务端渲染时直接调用会让 SSR
 * 输出跟客户端首次渲染不一致，触发 hydration mismatch。
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

  if (!mounted || isStandalone()) return null;

  const className =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink transition-colors hover:opacity-90';

  // iOS 没有 beforeinstallprompt，只能手动引导——带去设置页，那里的
  // InstallBanner 有完整的"分享→添加到主屏幕"步骤。
  if (isIOS()) {
    return (
      <a href="/settings" className={className}>
        <Download aria-hidden="true" className="size-3.5" />
        {t('installNavButton')}
      </a>
    );
  }

  if (!installable) return null;

  return (
    <button type="button" onClick={() => void promptInstall()} className={className}>
      <Download aria-hidden="true" className="size-3.5" />
      {t('installNavButton')}
    </button>
  );
}
