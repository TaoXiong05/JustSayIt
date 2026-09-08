'use client';

import { useLocale } from '@/lib/i18n/context';
import { CaptureDemo } from '@/components/marketing/CaptureDemo';

/**
 * 营销页 Hero 段——独立可裁剪/重排的组件，不依赖其它段的状态
 * （咨询要求：componentized so sections can be trimmed/reordered）。
 * 标题不再用渐变裁切文字——品牌渐变收窄到唯一的签名时刻（Logo 图标），
 * 这里跟应用内 Ledger/History/Stats 的话术标题用同一套纯色处理，两处
 * 视觉语言保持一致（改善方向 #2）。
 *
 * 改善方向 #4：产品最有代表性的时刻（"说一句话→秒变一条结构化账目"）
 * 之前是 Hero 之后单独一段（CaptureDemo），要往下滚一屏才看得到；标题
 * 本身只是标题+副标题+两个按钮的通用落地页公式，没有任何东西说明这是
 * 一个语音记账产品。现在把 CaptureDemo 直接并入 Hero、桌面端左右两栏——
 * 第一屏就同时看到"卖点文案"和"产品在做什么"，不用等第二屏。 */
export function Hero() {
  const { t } = useLocale();
  return (
    <section className="px-6 pb-10 pt-16 sm:pt-20">
      <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div className="text-center lg:text-left">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            {t('loginHeroTitle')}
          </h1>
          <p className="mt-4 text-base text-muted sm:text-lg">{t('loginHeroSubhead')}</p>
          <div className="mt-6 rounded-xl border border-border bg-surface p-4 text-left shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand">{t('dataFlowTitle')}</p>
            <div className="mt-3 grid grid-cols-3 items-center gap-2 text-center text-xs text-ink">
              <span className="rounded-lg bg-surface-2 px-2 py-2">{t('dataFlowInput')}</span>
              <span aria-hidden="true" className="text-muted">→</span>
              <span className="rounded-lg bg-surface-2 px-2 py-2">{t('dataFlowAI')}</span>
              <span aria-hidden="true" className="col-start-2 text-muted">↓</span>
              <span className="col-start-3 rounded-lg bg-brand-soft px-2 py-2 font-semibold">{t('dataFlowLedger')}</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{t('dataFlowNote')}</p>
            <p className="mt-2 text-xs font-medium text-brand">{t('dataFlowSync')}</p>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
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
        <CaptureDemo />
      </div>
    </section>
  );
}