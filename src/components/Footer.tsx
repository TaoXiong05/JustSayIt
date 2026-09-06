'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/context';

/**
 * 全站通用页脚——版权声明 + 隐私政策/服务条款入口，每个页面都有（用户
 * 明确要求）。放在 layout.tsx 里 {children} 之后、BottomNav 之前，跟
 * TopNav/MobileHeader 一样是全局的，不属于任何单个页面自己的内容。
 *
 * 底部 pb-24：移动端 BottomNav 是 fixed 定位、不参与文档流，页脚作为
 * 每个页面真正意义上的最后一块内容，需要自己留出这块被遮挡的空间——
 * 不能指望上面某个页面自己的 <main> 已经留过（那块留白在页脚之前，
 * 现在页脚才是滚动到底时真正贴着 BottomNav 的那一块）。桌面端没有
 * BottomNav，用更小的 pb-8 就够。
 */
export function Footer() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  // /ledger 改成了不滞动的定高布局（页眉+近期账单+输入区正好占满视口），
  // 没有多余的滚动空间留给页脚——只在这一个页面隐藏，其它页面不受影响。
  if (pathname === '/ledger') return null;
  return (
    <footer className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 text-center lg:max-w-5xl lg:pb-8">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
        <Link href="/privacy" className="hover:text-ink hover:underline">
          {t('footerPrivacyPolicy')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-ink hover:underline">
          {t('footerTermsOfService')}
        </Link>
      </div>
      <p className="mt-2 text-xs text-muted">
        {locale === 'zh' ? '© 2026 Tao Xiong 保留所有权利。' : '© 2026 Tao Xiong. All rights reserved.'}
      </p>
    </footer>
  );
}
