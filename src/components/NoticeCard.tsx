import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * 账本主屏输入区在"不能记账"的几种状态下（未登录、已登录但离线）共用的
 * 卡片外壳——同一套视觉（surface 底 + border + 圆图标 + 标题/说明），只换
 * 图标/文案/底部动作区，用户见过一次就认得这类卡片代表"输入区暂时不可用"，
 * 不用为每个状态重新学一套样式。用 shadow-pop 而不是列表/数据卡片统一的
 * shadow-card——这块跟 Composer 占的是同一个"主操作入口"位置，材质层级
 * 该跟 Composer 一致。
 */
export function NoticeCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop">
      <div className="flex items-start gap-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}
