'use client';

import { CloudOff, Mic, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';
import type { DictKey } from '@/lib/i18n/dictionary';

const FEATURES: { icon: LucideIcon; titleKey: DictKey; descKey: DictKey }[] = [
  { icon: Mic, titleKey: 'featureVoiceTitle', descKey: 'featureVoiceDesc' },
  { icon: Sparkles, titleKey: 'featureAutoTitle', descKey: 'featureAutoDesc' },
  { icon: CloudOff, titleKey: 'featureOfflineTitle', descKey: 'featureOfflineDesc' },
  { icon: ShieldCheck, titleKey: 'featurePrivacyTitle', descKey: 'featurePrivacyDesc' },
];

/** 4 张能力卡；id="features" 是 Hero 次要 CTA 的锚点（真实目标，非假地址）。 */
export function FeatureGrid() {
  const { t } = useLocale();
  return (
    <section id="features" className="px-6 py-12">
      <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
        {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
          <article
            key={titleKey}
            className="rounded-xl border border-border bg-surface p-5 shadow-card"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-brand">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <h3 className="mt-3 font-display text-base font-semibold text-ink">{t(titleKey)}</h3>
            <p className="mt-1 text-sm text-muted">{t(descKey)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}