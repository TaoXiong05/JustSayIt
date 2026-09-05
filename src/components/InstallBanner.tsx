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
      <div>
        <p>{t('installAlreadyInstalled')}</p>
      </div>
    );
  }

  return (
    <div>
      <p>{t('installTitle')}</p>
      {isIOS() ? (
        <p>{t('installInstructionsIOS')}</p>
      ) : (
        installable && (
          <button type="button" onClick={() => void promptInstall()}>
            {t('installActionAndroid')}
          </button>
        )
      )}
    </div>
  );
}
