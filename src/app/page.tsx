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
    <main>
      <header>
        <h1>{t('appTitle')}</h1>
        <SyncStatusDot />
        <button type="button" onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}>
          {t('localeToggleLabel')}
        </button>
        {user && (
          <a href="/settings" aria-label={t('settingsAvatarLabel')}>
            {user.picture ? (
              <img src={user.picture} alt="" width={32} height={32} />
            ) : (
              (user.email ?? user.googleSub).slice(0, 1).toUpperCase()
            )}
          </a>
        )}
      </header>
      {pending.length > 0 && (
        <ul>
          {pending.map((entry) => (
            <PendingRow key={entry.id} text={entry.text} />
          ))}
        </ul>
      )}
      {pendingRawInputs.length > 0 && (
        <ul>
          {pendingRawInputs.map((item) => (
            <QueuedRow key={item.id} text={item.text} />
          ))}
        </ul>
      )}
      <LedgerList transactions={transactions} />
      <SyncWarning />
      {lastAdded.length > 0 && (
        // key 用整批 id 拼接而非 length：强制每批新增都重新挂载 UndoToast，
        // 让其内部的自动关闭计时器真正重新开始，而不是复用上一批还在
        // 倒计时的那个（同 length 的连续两批单笔提交也会被区分开）。
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
        <Composer onSubmit={handleSubmit} />
      ) : (
        <p>
          <a href="/login">{t('logInPrompt')}</a>
        </p>
      )}
    </main>
  );
}
