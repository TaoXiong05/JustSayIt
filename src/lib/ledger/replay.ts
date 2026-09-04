import type { LedgerEvent } from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

export type Ledger = {
  transactions: Transaction[];
};

/**
 * 事件序列 → 账本状态。纯函数，无副作用。
 *
 * 对不存在的账目做 amend/delete 时静默忽略：多设备同步合并后，
 * 事件顺序不保证与因果一致（§7），抛错会让整个重放失败。
 */
export function replay(events: LedgerEvent[]): Ledger {
  const byId = new Map<string, Transaction>();
  const order: string[] = [];

  for (const e of events) {
    switch (e.kind) {
      case 'transaction_created': {
        if (!byId.has(e.payload.id)) order.push(e.payload.id);
        byId.set(e.payload.id, e.payload);
        break;
      }
      case 'transaction_amended': {
        const cur = byId.get(e.payload.id);
        if (cur) byId.set(e.payload.id, { ...cur, ...e.payload.changes });
        break;
      }
      case 'transaction_deleted': {
        byId.delete(e.payload.id);
        break;
      }
    }
  }

  const transactions = order
    .map((id) => byId.get(id))
    .filter((t): t is Transaction => t !== undefined)
    // 日期降序；同日保持事件写入顺序，使刚记的账出现在当日组内靠后位置
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { transactions };
}
