'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';
import { getSnapshot as getSyncSnapshot, reconcileUnsynced } from '@/lib/sync/status';

const LAST_ACCOUNT_KEY = 'justsayit.lastAccountGoogleSub';

/**
 * 账号切换检测。本地账本按设备存，不按 Google 账号分（events.ts 的事件里
 * 只有 deviceId，没有 userId/googleSub）——共享设备、先后登录过不同账号时，
 * 后登录的人看到的、能编辑/删除的是同一份本地数据。这个组件只做一件事：
 * 记住"这台设备上一次是哪个 googleSub 登录的"，跟这次登录对不上时，弹一个
 * 必须二选一才能关掉的弹窗（不允许背景点击/Escape 白板划走——不然等于
 * 没提示，risk 说了等于没说）。
 *
 * 挂在应用外壳（同 PersistStorageOnMount 那一层），不挂在 ledger/page.tsx：
 * 账号切换是全局状态，用户书签/分享链接直接进 /history、/stats、/settings
 * 也该被拦下来，不能只在访问 /ledger 时才检测到。
 */
export function AccountSwitchGuard() {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const [unsyncedCount, setUnsyncedCount] = useState<number | null>(null);

  useEffect(() => {
    if (loading || !user) return;
    const lastSeen = localStorage.getItem(LAST_ACCOUNT_KEY);
    if (lastSeen === null) {
      // 这台设备第一次见到任何账号登录——没有可比对的基准，本地数据是不是
      // "另一个账号"留下的根本无从判断，宁可不打扰，只记下这次的账号。
      localStorage.setItem(LAST_ACCOUNT_KEY, user.googleSub);
      return;
    }
    if (lastSeen === user.googleSub) return; // 同一个账号，不用管
    // 清空前先把"上一账号有没有未同步数据"这个事实定住——用户在弹窗里
    // 二选一之前，这个数字不能因为任何后台同步而变化。
    setUnsyncedCount(getSyncSnapshot().unsyncedIds.length);
  }, [loading, user]);

  async function resolve(clear: boolean): Promise<void> {
    if (clear) {
      await clearAllEvents();
      await hydrate();
      reconcileUnsynced([]); // 本地已清空，未同步集合里剩下的全是指向不存在账目的陈旧 id
    }
    if (user) localStorage.setItem(LAST_ACCOUNT_KEY, user.googleSub);
    setUnsyncedCount(null);
  }

  const open = unsyncedCount !== null;

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/50 data-[state=closed]:[animation:dialog-overlay-hide_150ms_ease-in] data-[state=open]:[animation:dialog-overlay-show_150ms_ease-out]" />
        <Dialog.Content
          // 阻断式：只能通过下面两个按钮关闭，背景点击/Escape 都不行——
          // Q11 的决定本身就是为了不让人"没细看就划掉"。
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop data-[state=closed]:[animation:dialog-content-hide_150ms_ease-in_forwards] data-[state=open]:[animation:dialog-content-show_150ms_ease-out_forwards]"
        >
          <Dialog.Title className="font-display text-base font-semibold text-ink">
            {t('accountSwitchTitle')}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted">
            {unsyncedCount !== null && unsyncedCount > 0
              ? t('accountSwitchBodyUnsynced', { count: unsyncedCount })
              : t('accountSwitchBodySafe')}
          </Dialog.Description>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => void resolve(false)}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
            >
              {t('accountSwitchKeep')}
            </button>
            <button
              type="button"
              onClick={() => void resolve(true)}
              className="rounded-md border border-danger-soft bg-danger-soft px-3 py-1.5 text-sm font-semibold text-danger transition-colors hover:opacity-90"
            >
              {t('accountSwitchClear')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
