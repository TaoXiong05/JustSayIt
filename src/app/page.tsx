'use client';

import { useState, useCallback, useEffect } from 'react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { QueuedRow } from '@/components/QueuedRow';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { SyncWarning } from '@/components/SyncWarning';
import { UndoToast } from '@/components/UndoToast';
import { useLedger, usePendingRawInputs } from '@/lib/ledger/useLedger';
import { addTransactions, removeTransaction, queueRawInput } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';
import { recentTransactions } from '@/lib/ledger/history';
import { initOfflineQueueAutoRetry } from '@/lib/ledger/offlineQueue';
import { initSync } from '@/lib/sync/init';
import { getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
import { useSession } from '@/lib/auth/client';
import { useLocale } from '@/lib/i18n/context';
import { randomUUID } from '@/lib/platform';

const DEFAULT_CURRENCY = 'AUD';

export default function Home() {
  const ledger = useLedger();
  const transactions = ledger.transactions;   // 稳定引用，无需 memo（见 Task 14）
  // §11.4 local-first：账本不因登录状态而隐藏；登录仅用于调用 AI / 语音
  const { user, loading } = useSession();
  const authed = !loading && user != null;
  const { locale, setLocale, t } = useLocale();
  const pendingRawInputs = usePendingRawInputs();

  useEffect(() => {
    return initOfflineQueueAutoRetry();
  }, []);

  useEffect(() => {
    return initSync();
  }, []);

  // 用提交自身的 id 而非文本内容作 key：两次提交内容完全相同时
  // （用户手滑连点，或确实连记两笔一样的账），按文本过滤会把两条
  // 占位行一起清掉，导致仍在等待中的那条提前消失。
  const [pending, setPending] = useState<{ id: string; text: string }[]>([]);
  const [lastAdded, setLastAdded] = useState<string[]>([]);

  const clearToast = useCallback(() => setLastAdded([]), []);

  const undo = useCallback(async () => {
    for (const id of lastAdded) await removeTransaction(id);
    setLastAdded([]);
  }, [lastAdded]);

  async function handleSubmit(text: string) {
    const pendingId = randomUUID();
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, { id: pendingId, text }]);
    try {
      const ctx = {
        localTime: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultCurrency: DEFAULT_CURRENCY,
      };
      if (!navigator.onLine) {
        await queueRawInput({ text, ...ctx });
        return; // 离线：不乐观插入账目，只排队等待联网后补跑（spec §9、§11.4）
      }
      const txs = await structureTextToTransactions(text, ctx);
      await addTransactions(txs);
      if (txs.length > 0) setLastAdded(txs.map((tx) => tx.id));
    } finally {
      setPending((p) => p.filter((entry) => entry.id !== pendingId));
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-2xl lg:pb-6">
      <header className="mb-5 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">{t('appTitle')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <SyncStatusDot />
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {t('localeToggleLabel')}
          </button>
          {user && (
            <a
              href="/settings"
              aria-label={t('settingsAvatarLabel')}
              className="flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
            >
              {user.picture ? (
                <img src={user.picture} alt="" width={32} height={32} className="rounded-full" />
              ) : (
                (user.email ?? user.googleSub).slice(0, 1).toUpperCase()
              )}
            </a>
          )}
        </div>
      </header>
      {pending.length > 0 && (
        <ul className="mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {pending.map((entry) => (
            <PendingRow key={entry.id} text={entry.text} />
          ))}
        </ul>
      )}
      {pendingRawInputs.length > 0 && (
        <ul className="mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {pendingRawInputs.map((item) => (
            <QueuedRow key={item.id} text={item.text} />
          ))}
        </ul>
      )}
      {/* 主屏只展示最近 10 条（Plan 5 Task 9 的 Ruling：10 是起始值，日后好调），
          完整历史由 /history 承担——"查看全部"入口无条件渲染。 */}
      <LedgerList transactions={recentTransactions(transactions, 10)} />
      <a
        href="/history"
        className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand transition-colors hover:text-brand-2"
      >
        {t('viewAllHistory')} →
      </a>
      <SyncWarning />
      {lastAdded.length > 0 && (
        // key 用整批 id 拼接而非 length：强制每批新增都重新挂载 UndoToast，
        // 触发一次新的 push()。「同 length 的连续两批单笔提交」也会被区分开——
        // Radix 每条 toast 持有独立的自动关闭计时器，但 effect 只在重新挂载
        // （或 count/unsyncedCount 变化）时才会跑；仅靠 props 变化驱动，
        // 两批同 count 的提交就没法各自产生一条新 toast。
        <UndoToast
          key={lastAdded.join(',')}
          count={lastAdded.length}
          unsyncedCount={
            lastAdded.filter((id) => getSyncSnapshot().unsyncedIds.includes(id)).length
          }
          onUndo={undo}
          onDismiss={clearToast}
        />
      )}
      {authed ? (
        <section className="mt-6">
          <Composer onSubmit={handleSubmit} />
        </section>
      ) : (
        <p className="mt-6">
          <a className="font-medium text-brand hover:text-brand-2" href="/login">
            {t('logInPrompt')}
          </a>
        </p>
      )}
    </main>
  );
}
