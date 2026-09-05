'use client';

import { useLocale } from '@/lib/i18n/context';
import type { DictKey } from '@/lib/i18n/dictionary';

const STATS: { numberKey: DictKey; labelKey: DictKey }[] = [
  { numberKey: 'statSpeedNumber', labelKey: 'statSpeedLabel' },
  { numberKey: 'statLocalNumber', labelKey: 'statLocalLabel' },
  { numberKey: 'statZeroNumber', labelKey: 'statZeroLabel' },
];

/** 三个能力 callout（<3s / 100% / 0），每组「数字 + 标签」双语。 */
export function StatStrip() {
  const { t } = useLocale();
  return (
    <section className="border-y border-border bg-surface/60 px-6 py-8">
      <dl className="mx-auto grid max-w-2xl grid-cols-3 gap-4 text-center">
        {STATS.map(({ numberKey, labelKey }) => (
          <div key={numberKey}>
            <dt className="font-display text-2xl font-bold text-brand sm:text-3xl">
              {t(numberKey)}
            </dt>
            <dd className="mt-1 text-xs text-muted sm:text-sm">{t(labelKey)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}