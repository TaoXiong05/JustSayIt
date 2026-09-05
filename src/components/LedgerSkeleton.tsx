'use client';

import { useLocale } from '@/lib/i18n/context';
import { Skeleton } from '@/components/Skeleton';

/**
 * /ledger 加载中的轮廓——外层容器 className 跟真实页面一字不差，保证
 * 骨架屏换成真实内容那一刻不会有布局跳动（宽度/内边距不用重新计算）。
 * 形状对应真实结构：居中标语 → 主操作卡片（Composer/登录卡片，两者
 * 高度接近，不用分别画）→ "近期账单" 标题行 → 列表卡片。
 */
export function LedgerSkeleton() {
  const { t } = useLocale();
  return (
    <main
      role="status"
      className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-2xl lg:pb-6"
    >
      <span className="sr-only">{t('pageLoading')}</span>
      <div className="mb-5 flex justify-center">
        <Skeleton className="h-6 w-2/3" />
      </div>
      <Skeleton className="mb-6 h-64 w-full rounded-2xl" />
      <div className="mb-1.5 flex items-center justify-between px-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-40 w-full rounded-lg" />
    </main>
  );
}
