'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { Hero } from '@/components/marketing/Hero';
import { StatStrip } from '@/components/marketing/StatStrip';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';
import { LoginSkeleton } from '@/components/LoginSkeleton';

export default function LoginPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const authed = !loading && user != null;

  useEffect(() => {
    // 已登录：直接去 /ledger（根路径 / 现在是按登录态分流的路由页，
    // 直接跳终点省一次多余的中转）
    if (authed) window.location.href = '/ledger';
  }, [authed]);

  // session 待定，或者已经确定登录、正等着上面的 effect 把人送走——
  // 这两种情况都不该先把营销页画出来再撤掉（用户明确要求：页面加载时
  // 不展示未确定内容，统一换成标准过渡动画）。
  if (loading || authed) return <LoginSkeleton />;

  return (
    <main>
      <Hero />
      <StatStrip />
      <FeatureGrid />
      {/* 隐私政策/服务条款链接现在是全局页脚（components/Footer.tsx，
          layout.tsx 里每个页面都有），这里不用再重复一份。 */}
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
