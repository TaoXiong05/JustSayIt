'use client';

import { useLocale } from '@/lib/i18n/context';
import { Skeleton } from '@/components/Skeleton';

/** /settings 加载中的轮廓——外层容器跟真实页面同一份 className，标题+四张卡片。 */
export function SettingsSkeleton() {
  const { t } = useLocale();
  return (
    <main
      role="status"
      className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-2xl lg:px-8 lg:pb-10"
    >
      <span className="sr-only">{t('pageLoading')}</span>
      <Skeleton className="mb-6 h-8 w-28" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </main>
  );
}
