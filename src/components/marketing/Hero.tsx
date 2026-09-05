'use client';

import { useLocale } from '@/lib/i18n/context';

/**
 * 营销页 Hero 段——独立可裁剪/重排的组件，不依赖其它段的状态
 * （咨询要求：componentized so sections can be trimmed/reordered）。
 * 标题不再用渐变裁切文字——品牌渐变收窄到唯一的签名时刻（Logo 图标），
 * 这里跟应用内 Ledger/History/Stats 的话术标题用同一套纯色处理，两处
 * 视觉语言保持一致（改善方向 #2）。
 */
export function Hero() {
  const { t } = useLocale();
  return (
    <section className="px-6 pb-10 pt-16 text-center sm:pt-24">
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          {t('loginHeroTitle')}
        </h1>
        <p className="mt-4 text-base text-muted sm:text-lg">{t('loginHeroSubhead')}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="/api/auth/login"
            className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-brand-ink shadow-pop transition-transform hover:scale-[1.02] sm:w-auto"
          >
            {t('logInAction')}
          </a>
          <a
            href="#features"
            className="w-full rounded-lg border border-border bg-surface px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 sm:w-auto"
          >
            {t('heroSecondaryCta')}
          </a>
        </div>
      </div>
    </section>
  );
}