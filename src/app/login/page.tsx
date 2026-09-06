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
      <footer className="flex flex-col items-center gap-3 px-6 pb-10 pt-2 text-center">
        <a
          href="/ledger"
          className="text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          {t('backToLedger')}
        </a>
        {/* Google OAuth consent screen 要求提供隐私政策/服务条款的公开链接
            （发布到 In production 的前置条件，design spec §11.1）——放在
            营销首页的页脚，是新访客最先落地、且不需要登录就能看到的地方。 */}
        <div className="flex items-center gap-3 text-xs text-muted">
          <a href="/privacy" className="underline-offset-2 hover:text-ink hover:underline">
            {t('footerPrivacyPolicy')}
          </a>
          <span aria-hidden="true">·</span>
          <a href="/terms" className="underline-offset-2 hover:text-ink hover:underline">
            {t('footerTermsOfService')}
          </a>
        </div>
      </footer>
    </main>
  );
}
