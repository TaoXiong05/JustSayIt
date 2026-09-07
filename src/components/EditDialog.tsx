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
          // 移动端是**贴底 sheet**、桌面端才是居中弹窗（sm: 起覆盖）。
          //
          // 换成 sheet 不是审美偏好，是治两个具体毛病：
          // 1. 原来 Save 在弹窗左下角（单手持机最难够到的位置），Delete 靠
          //    ml-auto 钉在右下角（拇指的自然落点）——主操作和破坏性操作的
          //    位置正好反了。贴底全宽之后主按钮横跨整个拇指区。
          // 2. 原来居中弹窗底边在 y≈619（375×812 实测），手机键盘一弹起来
          //    就把 Save 盖住了，而 top-1/2 的居中弹窗不会让位。
          //
          // 居中那套的 [transform:translate(-50%,-50%)] 只在 sm: 起生效——
          // sheet 是 inset-x-0 bottom-0 全宽铺开的，带上那个位移会跑偏；
          // 两套动画关键帧也因此必须分开（见 globals.css 的 sheet-show）。
          //
          // max-h-[85dvh] + overflow-y-auto：表单控件全部放大到 48px 之后
          // 内容会更高，矮屏上让 sheet 自己内部滚动，而不是顶出屏幕。
          // pb 用 env(safe-area-inset-bottom) 兜底：贴底元素必须避开 iPhone
          // 的 home indicator，否则最下面那行删除入口会被它压住。
          className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-pop data-[state=closed]:[animation:sheet-hide_200ms_ease-in_forwards] data-[state=open]:[animation:sheet-show_200ms_ease-out_forwards] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100%-2rem)] sm:max-w-md sm:rounded-xl sm:border sm:pb-5 sm:[transform:translate(-50%,-50%)] sm:data-[state=closed]:[animation:dialog-content-hide_150ms_ease-in_forwards] sm:data-[state=open]:[animation:dialog-content-show_150ms_ease-out_forwards]"
        >
          {/* sheet 顶部的抓握条：贴底面板的通用视觉约定，告诉用户这块是从
              底部升起来的一层、可以关掉。纯装饰，不承担交互。 */}
          <div
            aria-hidden="true"
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-border sm:hidden"
          />
          <div className="mb-4 flex items-center justify-between gap-3">
            <Dialog.Title className="font-display text-base font-semibold text-ink">
              {t('editDialogTitle')}
            </Dialog.Title>
            {/* 这个 X 现在是**唯一的取消入口**（表单底部不再有文字版
                Cancel，见 EditForm.tsx），所以尺寸必须达标：原来只有
                23×23px，是整个弹窗里最小的点击目标。size-11 = 44px，
                踩住 Apple HIG 的下限。
                无障碍名用 toastDismiss（"Dismiss"/"关闭"）而不是 editCancel——
                删除确认态里会出现一个真正叫 "Cancel" 的按钮，两个控件读出
                同一个名字的话，靠 accessible name 定位任一个都会因为"找到
                不止一个"而失败。 */}
            <Dialog.Close
              aria-label={t('toastDismiss')}
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X aria-hidden="true" className="size-5" />
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
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
