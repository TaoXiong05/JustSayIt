'use client';

import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { Hero } from '@/components/marketing/Hero';
import { CaptureDemo } from '@/components/marketing/CaptureDemo';
import { StatStrip } from '@/components/marketing/StatStrip';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';

export default function LoginPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();

  if (!loading && user) {
    // 已登录：直接回主屏
    if (typeof window !== 'undefined') window.location.href = '/';
  }

  return (
    <main>
      <Hero />
      <CaptureDemo />
      <StatStrip />
      <FeatureGrid />
      <footer className="px-6 pb-10 pt-2 text-center">
        <a
          href="/"
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          {t('backToLedger')}
        </a>
      </footer>
    </main>
  );
}