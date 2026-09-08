'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { NAV_TABS } from '@/lib/navTabs';
import { InstallNavButton } from '@/components/InstallNavButton';
import { Logo } from '@/components/Logo';

/**
 * 桌面端全局顶部导航——替代原来的侧边栏（用户明确要求：去掉侧边栏，
 * 导航/品牌/系统状态收进一条顶栏）。lg: 断点起显示，跟 BottomNav 同断点
 * 但互斥（移动端保持底部 tab 栏不变，是用户自己选的，没有跟着这次改版走
 * brief 里的汉堡菜单方案）。
 *
 * 语言切换/头像原先只长在主屏（page.tsx）自己的 header 里，现在挪到这条
 * 全局顶栏——主屏自己的 header 相应地在桌面端隐藏（lg:hidden），移动端
 * 不受影响，那两样还是靠主屏自己的 header 提供（移动端没有等价的全局
 * header）。同步状态点原来也在这里，现在挪去主屏"近期账单"标题旁
 * （ledger/page.tsx）——它是账本自己的健康度信号，跟全局导航是两回事；
 * 腾出来的位置换成醒目的安装入口（InstallNavButton）。
 */
export function TopNav() {
  const pathname = usePathname();
  const { user } = useSession();
  const { locale, setLocale, t } = useLocale();

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border bg-surface/90 backdrop-blur lg:block">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <nav className="flex flex-1 justify-center" aria-label="主导航">
          <ul className="flex items-center gap-1">
            {NAV_TABS.map(({ href, key, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-brand-soft text-brand'
                        : 'text-muted hover:bg-surface-2 hover:text-ink'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <InstallNavButton />
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {t('localeToggleLabel')}
          </button>
          {user && (
            <Link
              href="/settings"
              aria-label={t('settingsAvatarLabel')}
              className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
            >
              {user.picture ? (
                <img src={user.picture} alt="" width={32} height={32} className="rounded-full" />
              ) : (
                (user.email ?? user.googleSub).slice(0, 1).toUpperCase()
              )}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
