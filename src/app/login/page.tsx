'use client';

import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';

export default function LoginPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();

  if (!loading && user) {
    // 已登录：直接回主屏
    if (typeof window !== 'undefined') window.location.href = '/';
  }

  return (
    <main>
      <h1>{t('appTitle')}</h1>
      <p>{t('logInDescription')}</p>
      {/* 客户端不保存凭据；跳转 /api/auth/login → Google */}
      <p>
        <a href="/api/auth/login">{t('logInAction')}</a>
      </p>
      <p>
        <a href="/">{t('backToLedger')}</a>
      </p>
    </main>
  );
}