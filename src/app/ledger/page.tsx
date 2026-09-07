'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { QueuedRow } from '@/components/QueuedRow';
import { SyncWarning } from '@/components/SyncWarning';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { AddedFlash } from '@/components/AddedFlash';
import { useLedger, usePendingRawInputs } from '@/lib/ledger/useLedger';
import { addTransactions, queueRawInput } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';
import { recentTransactions } from '@/lib/ledger/history';
import { initOfflineQueueAutoRetry } from '@/lib/ledger/offlineQueue';
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
  // 账本页现在要求登录：未登录用户访问 /ledger 直接送去 /login（他们不需要
  // 这个页面来登录；要看本地账本历史去 /history，那是未登录可访问的）。
  // 登录仅额外解锁 AI / 语音能力。
  const { user, loading } = useSession();
  const authed = !loading && user != null;
  const { t } = useLocale();
  const pendingRawInputs = usePendingRawInputs();

  // 未登录 → 跳登录页。用 window.location（跟 app/page.tsx、settings/page.tsx
  // 的既有跳转同一个写法，测试里只断言 href 赋值）。
  useEffect(() => {
    if (!loading && !authed) window.location.href = '/login';
  }, [loading, authed]);

  useEffect(() => {
    return initOfflineQueueAutoRetry();
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

  // session 待定或确定未登录都要先经过统一过渡态：authed 在 loading 时恒为
  // false，不能提前画出完整页面又撤掉（已登录用户在加载瞬间会闪一下跟最终
  // 不一致的内容，用户明确要求：页面加载时不展示未确定内容，统一换成标准
  // 过渡动画）。未登录的情况这里会再被上面的 effect 送去 /login，骨架页是
  // 跳转前那一瞬的过渡。
  if (loading || !authed) return <LedgerSkeleton />;

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
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 truncate font-display text-sm font-semibold text-ink">
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
      {/* 输入区（本页只在已登录时渲染——未登录被上面的 effect 送去 /login，
          因此这里永远是 Composer，不存在访客分支）挪到最下面（用户明确要求：
          近期账单在上、输入区在下）。移动端 h-[42dvh]——紧贴底部 tab 栏之上，
          是单手持机时拇指最容易够到的区域；用户反馈最初的 50dvh 挤占了近期
          账单区，调小几个百分点把空间还给列表。桌面端原来是 lg:h-auto（内容
          自适应），用户反馈那样太窄、组件显挤，改成显式 lg:h-96，给 Composer
          内部留出跟移动端类似的呼吸感。 */}
      <div className="mt-3 flex h-[42dvh] shrink-0 flex-col justify-center lg:mt-6 lg:h-96 lg:block">
        <Composer onSubmit={handleSubmit} />
      </div>
      {lastAdded.length > 0 && (
        // key 用整批 id 拼接而非 length：强制每批新增都重新挂载 AddedFlash，
        // 各自重新播一遍飞入动画、各自计时。「同 length 的连续两批单笔
        // 提交」也会被区分开——仅靠 props 变化驱动，两批同 count 的提交
        // 会被判定成"同一条"，动画不会重新播放。
        <AddedFlash
          key={lastAdded.join(',')}
          count={lastAdded.length}
          unsyncedCount={
            lastAdded.filter((id) => getSyncSnapshot().unsyncedIds.includes(id)).length
          }
          onDone={clearToast}
        />
      )}
    </main>
  );
}
