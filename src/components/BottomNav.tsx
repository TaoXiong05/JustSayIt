'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/context';

/** 底部只有记账/统计两个 tab；设置从头像进，不占永久 tab（spec §13.1）。 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav>
      <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
        {t('navLedger')}
      </Link>
      <Link href="/stats" aria-current={pathname === '/stats' ? 'page' : undefined}>
        {t('navStats')}
      </Link>
    </nav>
  );
}
