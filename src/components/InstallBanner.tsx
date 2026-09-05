'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '@/lib/platform';
import { initInstallPromptCapture, canPromptInstall, promptInstall } from '@/lib/pwa/install';
import { useLocale } from '@/lib/i18n/context';

export function InstallBanner() {
  const { t } = useLocale();
  const [installable, setInstallable] = useState(() => canPromptInstall());

  useEffect(() => {
    const cleanup = initInstallPromptCapture();
    // beforeinstallprompt 触发时机不确定，轮询一次挂载后的状态即可——
    // 这个横幅本身不是高频重渲染的组件，用 useSyncExternalStore 属于过度设计。
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => {
      cleanup();
      clearInterval(id);
    };
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
