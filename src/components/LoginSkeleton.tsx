'use client';

import { useLocale } from '@/lib/i18n/context';
import { Skeleton } from '@/components/Skeleton';

/**
 * /login 加载中的轮廓——只画首屏的 Hero 形状（标题/副标题/两个按钮 +
 * 右侧 CaptureDemo 卡片，见 Hero.tsx），不画滚动线以下的 StatStrip/
 * FeatureGrid：这是个转瞬即逝的过渡态，真实内容一到就整段替换，没必要
 * 为了这几百毫秒把整页都描一遍轮廓。容器 className 跟 Hero.tsx 一致，
 * 换成真实内容时首屏不会跳动。
 */
export function LoginSkeleton() {
  const { t } = useLocale();
  return (
    <main role="status">
      <span className="sr-only">{t('pageLoading')}</span>
      <section className="px-6 pb-10 pt-16 sm:pt-20">
        <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div className="flex flex-col items-center gap-4 lg:items-start">
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-5 w-full max-w-md" />
            <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
              <Skeleton className="h-12 w-40 rounded-lg" />
              <Skeleton className="h-12 w-40 rounded-lg" />
            </div>
          </div>
          <Skeleton className="mx-auto h-80 w-full max-w-sm rounded-2xl lg:mx-0" />
        </div>
      </section>
    </main>
  );
}
