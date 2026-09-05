'use client';

import { useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { QueuedRow } from '@/components/QueuedRow';
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
  const { t } = useLocale();
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
      {/* 品牌 logo/同步点/语言切换/头像现在是全局页眉（桌面 TopNav、移动
          MobileHeader）提供的，不再是这个页面自己的东西——这里只留一个跟
          History/Stats 同样规格的页面标题，不然这个页面就没有属于自己的
          <h1> 了（之前是 logo 顶替，但 logo 现在每个页面都长一样，不该
          再兼任某一个页面专属的标题）。 */}
      <header className="mb-4">
        <h1 className="font-display text-xl font-bold text-ink">{t('navLedger')}</h1>
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
          完整历史由 /history 承担——固定高度、超出内部滚动，不随条数把输入区
          挤到折叠线以下。"View all history →" 链接已去掉：History 现在是
          全局导航（顶部导航栏/底部 tab）的常驻入口，这里再放一份纯属重复。 */}
      <div className="max-h-64 overflow-y-auto rounded-lg">
        <LedgerList transactions={recentTransactions(transactions, 10)} />
      </div>
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
        // 深色渐变卡片，故意不跟随浅色/深色主题切换——这是一个要主动抓
        // 眼球的招牌 CTA，不是普通页面文本，两种主题下都保持同一个深色
        // 微光观感（跟营销首页 Hero 的定位一致：都是"引导去登录"的关键
        // 时刻）。CTA 直接指向 OAuth 端点、不经过 /login 营销页——会看到
        // 这块 banner 的人已经在用产品了，不需要再看一遍营销话术，少一次
        // 跳转就少一次流失。
        <div className="relative mt-6 overflow-hidden rounded-2xl p-5 text-white shadow-pop">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(135deg,#0f0c29_0%,#2f2364_45%,#4f46e5_75%,#8b5cf6_100%)]"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-10 size-36 rounded-full bg-white/15 blur-3xl"
          />
          <div className="relative flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/15">
              <RefreshCw aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-semibold">{t('logInPrompt')}</p>
              <p className="mt-1 text-xs text-white/70">{t('logInDescription')}</p>
            </div>
          </div>
          <a
            href="/api/auth/login"
            className="relative mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition-transform hover:scale-[1.02]"
          >
            {t('logInAction')}
          </a>
        </div>
      )}
    </main>
  );
}
