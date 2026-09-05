'use client';

import { useLocale } from '@/lib/i18n/context';
import { Skeleton } from '@/components/Skeleton';

/**
 * 根路径 / 专用的加载态——它自己从不展示真实内容（永远直接跳到 /login
 * 或 /ledger），所以画不出一个"它本来长什么样"的轮廓，用一个中性、
 * 跟 LedgerSkeleton/SettingsSkeleton/LoginSkeleton 同一种"呼吸灰块"
 * 视觉语言的通用占位就够（改善方向：页面加载统一换成 Next.js 官方教程
 * 那种骨架屏轮廓，而不是一个跟页面内容无关的转圈图标）。
 */
export function PageLoading() {
  const { t } = useLocale();
  return (
    <main role="status" className="flex min-h-[60vh] items-center justify-center px-6">
      <span className="sr-only">{t('pageLoading')}</span>
      <div className="flex w-full max-w-xs flex-col items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </main>
  );
}
