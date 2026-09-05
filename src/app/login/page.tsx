'use client';

import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { Hero } from '@/components/marketing/Hero';
import { StatStrip } from '@/components/marketing/StatStrip';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';

export default function LoginPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();

  if (!loading && user) {
    // 已登录：直接去 /ledger（根路径 / 现在是按登录态分流的路由页，
    // 直接跳终点省一次多余的中转）
    if (typeof window !== 'undefined') window.location.href = '/ledger';
  }

  return (
    <main>
      <Hero />
      <StatStrip />
      <FeatureGrid />
      <footer className="px-6 pb-10 pt-2 text-center">
        <a
          href="/ledger"
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          {t('backToLedger')}
        </a>
      </footer>
    </main>
  );
}