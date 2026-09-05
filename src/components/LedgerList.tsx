import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';

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
  const { t } = useLocale();
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
          <h2 className="sticky top-0 z-10 bg-surface px-4 py-2 font-display text-sm font-semibold text-muted">
            {date}
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
