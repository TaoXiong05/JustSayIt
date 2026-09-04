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
  // 用 Map 自身的插入顺序语义代替手动维护的 order 数组：
  // 对已存在的 key 调用 set 不会改变其位置；先 delete 再 set 则视为全新插入、
  // 排到末尾——这正是「先删除、同 id 再新建」时应有的语义，且不会产生重复条目
  // （手动维护 order 数组曾在此处漏删已删除 id，导致重建后账目重复出现两次）。
  const byId = new Map<string, Transaction>();

  for (const e of events) {
    switch (e.kind) {
      case 'transaction_created': {
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
      case 'raw_input_queued':
      case 'raw_input_resolved':
        // 不产生/修改任何 Transaction——这两种事件由 lib/ledger/store.ts 的
        // pendingRawInputsFrom() 单独从原始事件流里读取，不进入 replay 的
        // byId 累积逻辑（它们本来就不是 Transaction）。
        break;
    }
  }

  const transactions = [...byId.values()]
    // 日期降序；同日保持事件写入顺序，使刚记的账出现在当日组内靠后位置
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { transactions };
}
