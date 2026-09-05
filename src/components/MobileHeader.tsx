'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { Logo } from '@/components/Logo';

/**
 * 移动端全局页眉：品牌 logo + 同步状态/语言切换/头像，不含导航链接——
 * 移动端导航已经由 BottomNav 的底部三个 tab 负责，页眉再放一遍会跟底部
 * tab 语义重复（用户明确要求：加页眉但不要导航栏）。跟 TopNav 共用同一批
 * 右侧控件，只是没有中间的导航区；lg: 起隐藏，交给 TopNav 接管。
 *
 * 这几样控件原先只长在主屏（page.tsx）自己的 header 里，其它页面
 * （历史/统计/设置）在移动端完全没有——意味着从历史页想切语言或进设置，
 * 得先跳回主屏。挪成全局页眉之后，主屏不再需要自己单独维护这一份，
 * page.tsx 改成跟其它页面一样只有一个描述页面内容的 <h1>。
 */
export function MobileHeader() {
  const { user } = useSession();
  const { locale, setLocale, t } = useLocale();

  return (
    <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
      <Link href="/" className="shrink-0">
        <Logo />
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <SyncStatusDot />
        <button
          type="button"
          onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('localeToggleLabel')}
        </button>
        {user && (
          <a
            href="/settings"
            aria-label={t('settingsAvatarLabel')}
            className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {user.picture ? (
              <img src={user.picture} alt="" width={32} height={32} className="rounded-full" />
            ) : (
              (user.email ?? user.googleSub).slice(0, 1).toUpperCase()
            )}
          </a>
        )}
      </div>
    </header>
  );
}
