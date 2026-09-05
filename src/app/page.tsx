'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ChevronRight } from 'lucide-react';
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
  // viaVoice 只是个瞬时展示状态（改善方向 #3：占位行上的"刚刚是说出来的"
  // 标记），不进 Transaction schema——账目一旦落地，"当时是打字还是说的"
  // 不是记账事实的一部分，也没必要为这个装饰性提示牵动 replay/event 结构。
  const [pending, setPending] = useState<{ id: string; text: string; viaVoice: boolean }[]>([]);
  const [lastAdded, setLastAdded] = useState<string[]>([]);

  const clearToast = useCallback(() => setLastAdded([]), []);

  const undo = useCallback(async () => {
    for (const id of lastAdded) await removeTransaction(id);
    setLastAdded([]);
  }, [lastAdded]);

  async function handleSubmit(text: string, viaVoice: boolean) {
    const pendingId = randomUUID();
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, { id: pendingId, text, viaVoice }]);
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
          MobileHeader）提供的，不再是这个页面自己的东西——页面自己的
          <h1> 不再是纯页面名（"Ledger"），换成一句話术标语，跟 History/
          Stats 三页统一风格：居中、比原来单词标题小一号（text-lg/sm:text-xl）
          + leading-snug，专为多行句子调过。用户明确要求纯话术、不加页面名
          小标签——当前页面靠底部/顶部导航栏自身的高亮状态识别。 */}
      <header className="mb-5">
        <h1 className="text-center font-display text-lg font-bold leading-snug text-ink sm:text-xl">
          {t('ledgerTagline')}
        </h1>
      </header>
      {/* 主输入区（已登录：Composer；访客：登录引导 banner）放在最前面——
          用户打开首页第一眼看到的应该是"能做什么"，而不是历史记录列表
          （用户明确要求：把 Ledger 列表挪到主输入区下面）。 */}
      {authed ? (
        <section className="mb-6">
          <Composer onSubmit={handleSubmit} />
        </section>
      ) : (
        // 之前是满版品牌渐变+白字的"招牌 CTA"卡片——跟 Logo/CTA/Hero 用的
        // 是同一个渐变，导致"重要"的东西全用同一招表达，互相抵消层级感
        // （改善方向 #2：渐变收窄到一个真正的签名时刻，这里改用跟其它
        // 卡片同一套语言：surface 底 + border，用 brand-soft 图标点题就够，
        // 不需要整张卡片都是品牌色）。CTA 直接指向 OAuth 端点、不经过
        // /login 营销页——会看到这张卡片的人已经在用产品了，不需要再看
        // 一遍营销话术，少一次跳转就少一次流失。这张卡片在访客态占的是
        // Composer 同一个位置（两者互斥），所以也用 shadow-pop 跟 Composer
        // 同一个"主操作入口"层级，而不是列表/数据卡片的 shadow-card
        // （改善方向 #6）。
        <div className="mb-6 rounded-2xl border border-border bg-surface p-5 shadow-pop">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <RefreshCw aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-semibold text-ink">{t('logInPrompt')}</p>
              <p className="mt-1 text-sm text-muted">{t('logInDescription')}</p>
            </div>
          </div>
          <div className="mt-4 flex justify-center">
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2.5 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-[#3c4043] shadow-sm transition-colors hover:bg-surface-2"
            >
              {/* Google 官方四色 G 标志，"使用 Google 登录"按钮的标准画法——
                  按钮本身用 Google 品牌指南要求的浅底深字，不跟随这个
                  项目自己的品牌色。 */}
              <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                />
              </svg>
              {t('logInAction')}
            </a>
          </div>
        </div>
      )}
      {pending.length > 0 && (
        <ul className="mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-card">
          {pending.map((entry) => (
            <PendingRow key={entry.id} text={entry.text} viaVoice={entry.viaVoice} />
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
          挤到折叠线以下。"查看全部历史"链接只在首页出现：History 页本身已经
          在这个链接的目的地里，再放一份纯属重复；首页则需要一条快捷路径。 */}
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="font-display text-sm font-semibold text-ink">
          {t('recentTransactionsTitle')}
        </h2>
        <Link
          href="/history"
          className="inline-flex items-center gap-0.5 text-sm font-medium text-brand hover:underline"
        >
          {t('viewAllHistory')}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
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
    </main>
  );
}
