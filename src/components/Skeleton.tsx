/**
 * 骨架屏的最小构件——一块会呼吸的灰色占位矩形。参考 Next.js 官方教程
 * （dashboard app 那套 loading.tsx + skeleton）的做法：加载过渡不是一个
 * 跟页面内容无关的转圈图标，而是页面自己长什么样的"轮廓"，内容到位后
 * 原地替换、不整体跳变。颜色用 --surface-2（已有的中性底色 token），
 * 不需要新增颜色；animate-pulse 是 Tailwind 内置的，已经受全局
 * prefers-reduced-motion 兜底约束（globals.css）。
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}
