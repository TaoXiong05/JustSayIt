'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { QueuedRow } from '@/components/QueuedRow';
import { SyncWarning } from '@/components/SyncWarning';
import { SyncStatusDot } from '@/components/SyncStatusDot';
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
import { ApiError } from '@/lib/apiError';
import { LedgerSkeleton } from '@/components/LedgerSkeleton';

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
      // AI 调用本身成功，但一条账目都没识别出来（比如提交了一串无意义
      // 字符）——跟真正的请求失败是两回事，但对用户来说同样需要反馈：
      // 不能既不提示、也不把占位行的"记账中"变成"记成功了"，否则用户会
      // 不知道这次提交到底算不算数（用户反馈原话）。复用 Composer 已有的
      // 失败处理路径（把原文还回输入框、显示红字提示），不用重新画一套。
      if (txs.length === 0) {
        throw new ApiError('未识别到有效账目', 'NO_TRANSACTIONS');
      }
      await addTransactions(txs);
      setLastAdded(txs.map((tx) => tx.id));
    } finally {
      setPending((p) => p.filter((entry) => entry.id !== pendingId));
    }
  }

  // session 状态是"待定"而不是"未登录"这段时间，不能提前画出访客态——
  // authed 在 loading 时恒为 false，之前会先闪一下访客登录卡片，等
  // useSession() 落定才翻成 Composer，对已登录用户是一次明显的内容跳变
  // （用户明确要求：页面加载时不展示未确定内容，统一换成标准过渡动画）。
  // 这跟 §11.4 local-first 不冲突——账本不因"确定未登录"而隐藏，这里挡的
  // 只是"还不知道算不算登录"的过渡瞬间。
  if (loading) return <LedgerSkeleton />;

  return (
    // 整页改成定高不滞动布局（用户明确要求）：main 自身高度 = 视口
    // 减去页眉（MobileHeader/TopNav 都是 h-14）和移动端底部 tab 栏
    // （BottomNav h-16，桌面端没有故不减）。近期账单区占满剩余空间自己
    // 滚动，输入区固定在底部——不再依赖整页滚动+pb-28 避让底部 tab 栏
    // 的老办法。
    <main className="mx-auto flex h-[calc(100dvh-3.5rem-4rem)] w-full max-w-xl flex-col overflow-hidden px-4 pb-3 pt-4 lg:h-[calc(100dvh-3.5rem)] lg:max-w-2xl lg:pb-6 lg:pt-6">
      {/* 近期账单区（用户明确要求：挪到输入区上面）：flex-1 吃掉除输入区
          外的所有剩余高度，min-h-0 是让 flex 子项的 overflow-y-auto 真正
          生效的关键（没有它，flex item 默认不会收缩到比内容更矮，滚动条
          永远不会出现）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 主屏只展示最近 10 条（Plan 5 Task 9 的 Ruling：10 是起始值，日后好调），
            完整历史由 /history 承担。"查看全部历史"链接只在首页出现：History
            页本身已经在这个链接的目的地里，再放一份纯属重复；首页则需要一条
            快捷路径。同步状态点原来长在全局页眉里，现在挪到这儿——它描述的
            是"这份账本有没有同步"，跟下面这份最近账单列表是同一件事。 */}
        <div className="mb-1.5 flex shrink-0 items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-sm font-semibold text-ink">
              {t('recentTransactionsTitle')}
            </h2>
            <SyncStatusDot />
          </div>
          <Link
            href="/history"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-brand hover:underline"
          >
            {t('viewAllHistory')}
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {/* 这个滚动容器本身就是那张白色卡片（border/bg-surface/shadow-card
            直接搬到这一层，日期标题也改用同色背景，见 LedgerList.tsx）——
            滚动容器的可见范围和可交互范围完全重合，不会出现"看着是外面、
            其实已经在里面"的灰色地带。overscroll-contain 防止滑到顶/底之后
            继续被"接力"到页面滚动。pending/queued 占位行并入这同一张滚动
            卡片顶部（原来是各自独立的卡片）——它们本来就是"即将变成账单"
            的条目，跟着历史记录一起滚动更自然，也不再挤占输入区的空间。 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-border bg-surface shadow-card">
          {pending.length > 0 && (
            <ul className="border-b border-border">
              {pending.map((entry) => (
                <PendingRow key={entry.id} text={entry.text} viaVoice={entry.viaVoice} />
              ))}
            </ul>
          )}
          {pendingRawInputs.length > 0 && (
            <ul className="border-b border-border">
              {pendingRawInputs.map((item) => (
                <QueuedRow key={item.id} text={item.text} />
              ))}
            </ul>
          )}
          <LedgerList transactions={recentTransactions(transactions, 10)} />
        </div>
      </div>
      <SyncWarning />
      {/* 输入区（已登录：Composer；访客：登录引导 banner）挪到最下面
          （用户明确要求：近期账单在上、输入区在下）。移动端 h-[42dvh]——
          紧贴底部 tab 栏之上，是单手持机时拇指最容易够到的区域；用户反馈
          最初的 50dvh 挤占了近期账单区，调小几个百分点把空间还给列表。
          桌面端原来是 lg:h-auto（内容自适应），用户反馈那样太窄、组件显挤，
          改成显式 lg:h-96，给 Composer 内部留出跟移动端类似的呼吸感。 */}
      <div className="mt-3 flex h-[42dvh] shrink-0 flex-col justify-center lg:mt-6 lg:h-96 lg:block">
        {authed ? (
          <Composer onSubmit={handleSubmit} />
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
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-pop">
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
      </div>
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
