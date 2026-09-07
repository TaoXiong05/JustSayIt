import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { formatDayHeader } from '@/lib/i18n/date';

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.date);
    if (list) list.push(t);
    else groups.set(t.date, [t]);
  }
  return [...groups.entries()];
}

/**
 * 只在主屏"近期账单"里用（ledger/page.tsx）——外层滚动容器现在自己就是
 * 那张白色卡片（border/bg-surface/shadow-card 在 ledger/page.tsx 那一层），
 * 这里不再各自起一张独立卡片，日期标题也改成同一个白底，滚动容器的
 * 可见范围和可交互范围完全重合（用户反馈：鼠标还没进入白色区域就已经
 * 能滚动列表）。多个日期之间靠 section 自己的下边框分隔，不再用外边距
 * 撑出缝隙——那道缝隙之前会露出页面背景色，又是一小块"看着在外面、
 * 其实已经在滚动容器里"的地方。
 */
export function LedgerList({ transactions }: { transactions: Transaction[] }) {
  const { t, locale } = useLocale();
  if (transactions.length === 0) {
    // 外层容器（ledger/page.tsx）本身已经是白底+边框的卡片，这里不用
    // 再画第二层边框，否则会变成"卡片里嵌卡片"。
    return <p className="p-8 text-center text-sm text-muted">{t('emptyLedger')}</p>;
  }
  return (
    <div>
      {groupByDate(transactions).map(([date, items]) => (
        <section key={date} className="border-b border-border last:border-b-0">
          {/* 日期标题吸顶，滚动明细时它不跟着滚走。背景色必须跟卡片本身
              一致（bg-surface，不是页面背景色 bg-bg）：一是 sticky 定住后
              下面滚上来的账目卡片会被它盖住，没有实色背景会透出来叠在
              一起看不清；二是保持整个滚动容器视觉上是同一块白色，不要
              露出一条颜色不一样的缝。 */}
          {/* 日期用 formatDayHeader 本地化（"Sun, Sep 7"），跟 History 页共用
              同一个实现——这里原来直接渲染裸的 `2026-09-07`，同一份列表在两个
              页面长得不一样。
              py-1.5 + text-xs：标题原来 36px，比一整行账目（48px）的 3/4 还高，
              作为分隔符抢了太多注意力；压到 28px 之后它只是个刻度，不是内容。 */}
          <h2 className="sticky top-0 z-10 bg-surface px-4 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-muted">
            {formatDayHeader(date, locale)}
          </h2>
          <ul>
            {items.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
