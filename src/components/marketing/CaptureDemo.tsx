'use client';

import { Mic } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';

const WAVEFORM = [5, 12, 8, 16, 10, 14, 6, 11, 15, 9, 7, 13];
// 跟 VoiceButton 录音态的错峰节奏是同一套设计语言（改善方向 #3 的声音
// 母题延伸到这里）——不同条形错开起伏，做出"正在收音"的持续动感，而不是
// 之前那一排纯装饰、完全静止的柱子（一个"演示产品长什么样"的 mockup
// 却是静止的，本身就有点奇怪）。
const WAVEFORM_DELAYS_MS = [0, 120, 240, 360, 180, 60, 300, 90, 210, 330, 150, 30];

const DEMO_ROWS = [
  { category: 'FOOD' as const, merchant: 'Coles', amount: '-28.45' },
  { category: 'TRANSPORT' as const, merchant: 'Uber', amount: '-12.90' },
];

/**
 * 静态（非功能性）产品演示 mockup：mic-orb → 波形 → 转写 → 分类行，
 * 对应 artifact mockup 的序列。营销装饰，**不**接 STT/AI（星座决策）。
 * 整段装饰性内容对无障碍树隐藏。
 *
 * 改善方向 #4：这个组件现在直接嵌进 Hero（见 Hero.tsx），是第一屏就
 * 看得到的"产品是什么"缩影，不再是外层自己的 <section>——外层留给
 * Hero 统一控制布局/间距，这里只负责卡片本身。
 */
export function CaptureDemo() {
  const { locale } = useLocale();
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-pop lg:mx-0"
    >
      {/* mic orb——跟真实的 VoiceButton 一样用纯色 brand，不是渐变：这个
          mockup 是在演示产品本身的样子，不该比真实按钮更花哨（渐变收窄
          到 Logo 一处，改善方向 #2）。 */}
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-brand-ink">
        <Mic className="size-7" />
      </div>

      {/* waveform */}
      <div className="mt-4 flex h-10 items-center justify-center gap-1.5">
        {WAVEFORM.map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-brand-soft [animation:voice-wave_1.1s_ease-in-out_infinite]"
            style={{ height: `${h * 2}px`, animationDelay: `${WAVEFORM_DELAYS_MS[i]}ms` }}
          />
        ))}
      </div>

      {/* transcript */}
      <p className="mt-3 text-center font-mono tabular-nums text-sm text-ink">“Coles 28.45”</p>

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
  );
}
