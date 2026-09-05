import { Mic } from 'lucide-react';

/**
 * 品牌 logo：图标方块 + 两色 wordmark，替换纯文字版本。
 * 图标复用项目统一的 lucide Mic（跟 VoiceButton/CaptureDemo 是同一个
 * 组件，不是手抄一份内联 SVG）；方块用品牌渐变（brand → brand-2），
 * 跟 CaptureDemo 的 mic-orb 是同一种画法，不是另起一种"纯色品牌底"——
 * 用户提供的参考图是纯色 indigo-600，这里改成渐变是为了跟已经确立的
 * 视觉语言保持一致，而不是引入第三种图标底样式。颜色一律走 design
 * token（--brand/--ink），不用参考图里的 raw Tailwind indigo-600/
 * gray-900——那样会绕开这个项目已经做好的深色模式支持。
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-white shadow-pop">
        <Mic aria-hidden="true" className="size-5" />
      </span>
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        Just<span className="text-brand">Say</span>It
      </span>
    </span>
  );
}
