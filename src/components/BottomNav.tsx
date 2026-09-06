'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/context';
import { NAV_TABS } from '@/lib/navTabs';

/**
 * 底部三 tab：记账 / 历史 / 统计；设置从头像进，不占永久 tab（spec §13.1）。
 * 激活态用品牌色（--brand）指示，绝不用 income/expense 语义色（Global
 * Constraint 1）。移动端显示；桌面端由全局 TopNav 接管（顶部导航，lg: 起
 * 这里隐藏——移动端保持底部 tab 栏是用户明确选择保留的，没有跟着桌面端
 * 从侧边栏改顶栏这次改版走）。
 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-border bg-surface/90 backdrop-blur lg:hidden">
      <ul className="mx-auto flex h-full max-w-md items-stretch justify-around">
        {NAV_TABS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  active ? 'text-brand' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon aria-hidden="true" className="size-5" />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
