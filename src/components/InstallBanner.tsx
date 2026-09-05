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

  // 卡片外壳跟 settings/page.tsx 的 SettingsCard 保持完全一致（rounded-xl +
  // p-5），不是各自维护一份相近但不同的圆角/内边距——不然设置页里这四张卡片
  // 挨在一起看，这一张会很显眼地"差一点"。
  if (isStandalone()) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-sm text-muted">{t('installAlreadyInstalled')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-sm font-semibold text-ink">{t('installTitle')}</p>
        {!isIOS() && installable && (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex shrink-0 items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
          >
            {t('installActionAndroid')}
          </button>
        )}
      </div>
      {isIOS() && <p className="mt-2 text-sm text-muted">{t('installInstructionsIOS')}</p>}
    </div>
  );
}
