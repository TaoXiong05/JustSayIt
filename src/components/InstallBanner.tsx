'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';
import { useLocale } from '@/lib/i18n/context';

export function InstallBanner() {
  const { t } = useLocale();
  const [installable, setInstallable] = useState(() => canPromptInstall());

  useEffect(() => {
    // 事件的捕获在应用外壳层（PersistStorageOnMount）就已经挂好了——Chrome
    // 只在页面早期派发一次 beforeinstallprompt，等到用户点进设置页才挂监听
    // 就晚了。这里只读结果：轮询一次挂载后的状态即可，这个横幅本身不是高频
    // 重渲染的组件，用 useSyncExternalStore 属于过度设计。
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => clearInterval(id);
  }, []);

  if (isStandalone()) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
        <p className="text-sm text-muted">{t('installAlreadyInstalled')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <p className="font-display text-sm font-semibold text-ink">{t('installTitle')}</p>
      <div className="mt-2">
        {isIOS() ? (
          <p className="text-sm text-muted">{t('installInstructionsIOS')}</p>
        ) : (
          installable && (
            <button
              type="button"
              onClick={() => void promptInstall()}
              className="rounded bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
            >
              {t('installActionAndroid')}
            </button>
          )
        )}
      </div>
    </div>
  );
}
