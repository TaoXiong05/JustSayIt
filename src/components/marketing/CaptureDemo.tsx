'use client';

import { Mic } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';

const WAVEFORM = [5, 12, 8, 16, 10, 14, 6, 11, 15, 9, 7, 13];

const DEMO_ROWS = [
  { category: 'FOOD' as const, merchant: 'Coles', amount: '-28.45' },
  { category: 'TRANSPORT' as const, merchant: 'Uber', amount: '-12.90' },
];

/**
 * 静态（非功能性）产品演示 mockup：mic-orb → 波形 → 转写 → 分类行，
 * 对应 artifact mockup 的序列。营销装饰，**不**接 STT/AI（星座决策）。
 * 整段装饰性内容对无障碍树隐藏。
 */
export function CaptureDemo() {
  const { locale } = useLocale();
  return (
    <section aria-hidden="true" className="px-6 py-8">
      <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-pop">
        {/* mic orb */}
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-2 text-brand-ink">
          <Mic className="size-7" />
        </div>

        {/* waveform */}
        <div className="mt-4 flex h-10 items-center justify-center gap-1.5">
          {WAVEFORM.map((h, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-brand-soft"
              style={{ height: `${h * 2}px` }}
            />
          ))}
        </div>

        {/* transcript */}
        <p className="mt-3 text-center font-mono tabular-nums text-sm text-ink">
          “Coles 28.45”
        </p>

        {/* categorized rows */}
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {DEMO_ROWS.map((row) => {
            const Icon = CATEGORY_ICONS[row.category];
            return (
              <li
                key={row.merchant}
                className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                  <Icon className="size-3.5" />
                </span>
                <span className="flex-1 text-xs font-medium text-ink">{row.merchant}</span>
                <span className="text-[10px] text-muted">
                  {CATEGORY_LABELS[locale][row.category]}
                </span>
                <span className="font-mono tabular-nums text-xs font-medium text-expense">
                  {row.amount}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}