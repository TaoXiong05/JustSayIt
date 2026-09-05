'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, History, ReceiptText, type LucideIcon } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';

/**
 * 桌面端侧边导航（Task 15）：lg: 断点起替代底部导航（BottomNav 同断点隐藏）。
 * 与 BottomNav 共用一份 tab 定义，避免两处漂移。
 */
const TABS: { href: string; key: 'navLedger' | 'navHistory' | 'navStats'; icon: LucideIcon }[] = [
  { href: '/', key: 'navLedger', icon: ReceiptText },
  { href: '/history', key: 'navHistory', icon: History },
  { href: '/stats', key: 'navStats', icon: BarChart3 },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-border bg-surface lg:flex">
      <div className="flex h-14 shrink-0 items-center border-b border-border px-5">
        <span className="font-display text-base font-bold text-ink">JustSayIt</span>
      </div>
      <nav className="flex-1 p-3" aria-label="主导航">
        <ul className="space-y-1">
          {TABS.map(({ href, key, icon: Icon }) => {
            const active = pathname === href;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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
    </aside>
  );
}