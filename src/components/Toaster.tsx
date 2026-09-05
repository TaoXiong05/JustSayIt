'use client';

import * as Toast from '@radix-ui/react-toast';
import { AlertTriangle, CheckCircle2, CircleAlert, X, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import {
  dismissToast,
  getSnapshot,
  subscribe,
  type ToastItem,
  type ToastVariant,
} from '@/lib/toast';
import { useLocale } from '@/lib/i18n/context';

const DURATION_MS = 6000;

// useSyncExternalStore 的第三个参数（getServerSnapshot）必须每次调用都返回
// 同一个引用，否则 React 会判定"每次快照都不同"，报
// "The result of getServerSnapshot should be cached to avoid an infinite
// loop"。`() => []` 每次调用都会分配一个新数组，正好踩中这个坑——同一份
// 模式在本文件其它 useSyncExternalStore 用法（如 SyncStatusDot 的
// EMPTY_SYNC_STATE）里已经用模块级常量避开了，这里之前漏做。
const EMPTY_TOASTS: ToastItem[] = [];

/** 每个变体的左舷色 + 图标，严格按 artifact 的 toast mockup：
 *  success=收入绿左框 + 对勾、warning=琥珀左框 + 三角、error=支出红左框 + 圆叹号。
 *  注意：这里出现的 income/expense 色是方案显式授权的 toast 语义色用法，
 *  不属于 Global Constraint 1 禁止的「品牌按钮复用交易色」。 */
const VARIANT_BORDER: Record<ToastVariant, string> = {
  success: 'border-l-income',
  warning: 'border-l-warning',
  error: 'border-l-expense',
};

const VARIANT_ICON: Record<ToastVariant, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: CircleAlert,
};

const VARIANT_ICON_COLOR: Record<ToastVariant, string> = {
  success: 'text-income',
  warning: 'text-warning',
  error: 'text-expense',
};

export function Toaster() {
  const { t } = useLocale();
  const toasts = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_TOASTS);
  return (
    <Toast.Provider duration={DURATION_MS} swipeDirection="right" label={t('toastRegion')}>
      {toasts.map((item) => (
        <ToastItem key={item.id} item={item} />
      ))}
      <Toast.Viewport className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:inset-x-auto md:items-end md:px-0" />
    </Toast.Provider>
  );
}

function ToastItem({ item }: { item: ToastItem }) {
  const { t } = useLocale();
  const Icon = VARIANT_ICON[item.variant];
  const iconColor = VARIANT_ICON_COLOR[item.variant];

  function handleClose(): void {
    dismissToast(item.id);
    item.onDismiss?.();
  }

  return (
    <Toast.Root
      type="foreground"
      role={item.variant === 'error' ? 'alert' : undefined}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-border border-l-4 bg-surface p-3 shadow-pop ${VARIANT_BORDER[item.variant]}`}
    >
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <Toast.Title className="text-sm font-medium text-ink">{item.message}</Toast.Title>
        {item.action && (
          <div className="mt-2">
            <Toast.Action asChild altText={item.action.label} onClick={item.action.onClick}>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm font-semibold text-brand transition-colors hover:bg-brand-soft"
              >
                {item.action.label}
              </button>
            </Toast.Action>
          </div>
        )}
      </div>
      <Toast.Close asChild>
        <button
          type="button"
          aria-label={t('toastDismiss')}
          className="mt-0.5 shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </Toast.Close>
    </Toast.Root>
  );
}