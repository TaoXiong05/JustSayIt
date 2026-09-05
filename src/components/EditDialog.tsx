'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { EditForm } from '@/components/EditForm';

/**
 * 点账目行的编辑交互，Plan 5 二次改版从"原位展开"改成"居中弹窗"——
 * 推翻的是 spec §13.2 原先"原位展开，不用模态"的决定，是这次改版明确要求的，
 * 不是随手加的：Global Constraint 4（Radix 只用在 Toast 上）也一并被
 * 这次改版扩展到 Dialog。
 *
 * 取消路径统一：点背景遮罩、按 Escape、点"取消"，都只是把 `open` 置为
 * false——从不调用 onSave/onDelete。Radix Dialog 本身就把这三种关闭方式
 * 统一成一个 onOpenChange(false) 回调，不用分别接三套事件。表单内部状态
 * 天然作废，不需要额外"丢弃"逻辑：Dialog 关闭动画播完后 Radix 的 Presence
 * 会真正把 EditForm 从 DOM 卸载（见 globals.css 的 dialog-content-hide
 * 注释），下次打开是全新挂载、全新 useState 初始值。
 */
export function EditDialog({
  open,
  onOpenChange,
  transaction,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction;
  onSave: (changes: Partial<Omit<Transaction, 'id'>>) => void;
  onDelete: () => void;
}) {
  const { t } = useLocale();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-testid="edit-dialog-overlay"
          className="fixed inset-0 z-50 bg-ink/50 data-[state=closed]:[animation:dialog-overlay-hide_150ms_ease-in] data-[state=open]:[animation:dialog-overlay-show_150ms_ease-out]"
        />
        <Dialog.Content
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop data-[state=closed]:[animation:dialog-content-hide_150ms_ease-in] data-[state=open]:[animation:dialog-content-show_150ms_ease-out]"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <Dialog.Title className="font-display text-base font-semibold text-ink">
              {t('editDialogTitle')}
            </Dialog.Title>
            {/* 用 toastDismiss（"Dismiss"/"关闭"）而不是 editCancel（"Cancel"）
                做这个 X 的无障碍名——表单下方还有一个文字版"Cancel"按钮，
                两个控件如果读出同一个名字，靠 accessible name 定位任一个都
                会因为"找到不止一个"而失败，用户用读屏器听到两个同名按钮
                也分不清哪个是哪个。 */}
            <Dialog.Close
              aria-label={t('toastDismiss')}
              className="rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
          </div>
          <EditForm
            transaction={transaction}
            onSave={(changes) => {
              onSave(changes);
              onOpenChange(false);
            }}
            onDelete={() => {
              onDelete();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
