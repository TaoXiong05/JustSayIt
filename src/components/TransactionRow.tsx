'use client';

import { useState } from 'react';
import { CloudOff } from 'lucide-react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';
import { CATEGORY_TINTS } from '@/lib/i18n/categoryTint';
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot as getSyncSnapshot, EMPTY_SYNC_STATE } from '@/lib/sync/status';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';
import { EditDialog } from '@/components/EditDialog';

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { t, locale } = useLocale();
  const syncState = useSyncExternalStore(subscribe, getSyncSnapshot, () => EMPTY_SYNC_STATE);
  const synced = !syncState.unsyncedIds.includes(transaction.id);
  const isIncome = transaction.type === 'INCOME';
  const [editing, setEditing] = useState(false);
  const CategoryIcon = CATEGORY_ICONS[transaction.category];
  const tint = CATEGORY_TINTS[transaction.category];
  const categoryLabel = CATEGORY_LABELS[locale][transaction.category];

  // merchant 认不出来时（prompt 规则 9 明确允许 merchant=null，"asd 22" 这类
  // 随手记必然走到这里），主行降级显示 description——48px 里最贵的就是主行
  // 那 14px 加粗的位置，用它显示一个破折号是纯浪费，而副行的 description 才
  // 是唯一能认出这笔账是什么的东西。降级之后副行只剩分类名，不重复主行。
  const title = transaction.merchant ?? transaction.description;
  const subtitle = transaction.merchant
    ? `${transaction.description} · ${categoryLabel}`
    : categoryLabel;

  return (
    <li className="border-b border-border last:border-b-0">
      {/* py-1.5 = 48px 行高：两行文字本身就是 36px（14px + 12px 两行行高），
          上下各 6px 收边。撑高的不再是分类头像——它从 40px 缩到 28px 之后
          比文字块矮，高度改由内容决定。点按热区仍有 48px，超过 44px 的最小值。 */}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        {/* 分类头像：28px 圆形 + 14px 图标（原来是 40px 圆角方块，是整行
            高度的元凶）。配色仍走 CATEGORY_TINTS，跟 income/expense/brand
            语义色脱钩（见 categoryTint.ts）。 */}
        <span
          aria-hidden="true"
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${tint.bg}`}
        >
          <CategoryIcon className={`size-3.5 ${tint.fg}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-ink">{title}</span>
            {/* 未同步标记：只有异常态才出现（spec §8.5 要的是"不点开就知道
                有没有同步"，已同步是 99% 的常态，不该占用视觉，更不该占一
                整列宽度）。内联在商户名后面而不是金额旁边——它描述的是这
                条记录，且这样放完全不动金额列，不会出现"只有未同步的行金额
                被往左推、整列右边界对不齐"。 */}
            {!synced && (
              <CloudOff
                aria-label={t('rowUnsynced')}
                className="size-3.5 shrink-0 text-warning"
              />
            )}
          </span>
          {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
              本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持 §6、§7）。 */}
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>
        {/* 金额：16px bold，且**只有收入着色、只有收入带正号**。支出是常态，
            一屏全是红字既没有区分度（人人都红等于都不红）、又给记账平添压力；
            收入是稀有事件，绿色 + 加号才真正起到"这条不一样"的作用。
            这不违反 Global Constraint 1——income/expense 两个语义色仍然只用在
            金额上，只是支出改用中性的 ink，没有把它们挪作他用。 */}
        <span
          className={`shrink-0 font-mono tabular-nums text-base font-bold ${
            isIncome ? 'text-income' : 'text-ink'
          }`}
        >
          {`${isIncome ? '+' : ''}${formatAmount(transaction.amountCents, transaction.currency)}`}
        </span>
      </button>
      <EditDialog
        open={editing}
        onOpenChange={setEditing}
        transaction={transaction}
        onSave={(changes) => void amendTransaction(transaction.id, changes)}
        onDelete={() => void removeTransaction(transaction.id)}
      />
    </li>
  );
}
