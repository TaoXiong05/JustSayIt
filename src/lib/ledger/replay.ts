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
 *
 * **重放前必须按 createdAt（相同则按 eventId 兜底）排序一份副本。**
 * create/delete 是纯追加/墓碑操作，处理顺序不影响最终结果，spec §7"结构上
 * 不存在写冲突"对它们成立；但 transaction_amended 是字段级覆盖
 * （`{...cur, ...changes}`），顺序不同结果就不同——而事件数组的原始顺序是
 * "本地写入顺序"，不是"实际编辑时间"：自己刚编辑的事件永远排在本机最前面，
 * 同步合并进来的别人的编辑永远追加在后面（db.ts 的 IndexedDB 用
 * autoIncrement，appendEvents 去重后也不会重排序）。两台设备并发编辑同一
 * 账目的同一字段时，各自会把"对方的编辑"排在后面而让它生效——A 机器上是
 * B 的改动赢，B 机器上是 A 的改动赢，两边永久不一致，且不会自愈。按
 * createdAt 排序后两边输入的是同一组事件、算出来的顺序也一样，至少能收敛
 * 到同一个结果（客户端时钟不校验，极端情况下"更晚编辑"未必真的赢，但好过
 * 现在的永久分裂）。eventId 只在 createdAt 完全相同的真并发下才用得上，
 * 纯粹是让排序在这种边缘情况下依然确定。
 */
export function replay(events: LedgerEvent[]): Ledger {
  const ordered = [...events].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  // 用 Map 自身的插入顺序语义代替手动维护的 order 数组：
  // 对已存在的 key 调用 set 不会改变其位置；先 delete 再 set 则视为全新插入、
  // 排到末尾——这正是「先删除、同 id 再新建」时应有的语义，且不会产生重复条目
  // （手动维护 order 数组曾在此处漏删已删除 id，导致重建后账目重复出现两次）。
  const byId = new Map<string, Transaction>();

  for (const e of ordered) {
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
        // 离线排队功能已下线，不会再有新的这两种事件产生（见 events.ts
        // 里 RawInputQueuedPayload 上的说明）——这个 case 纯粹是兼容性
        // no-op：万一某台设备的本地 IndexedDB 里还躺着旧版本留下的这类
        // 事件，replay 得认得这个 kind 才不会当成未知事件出岔子，但它们
        // 本来就不是 Transaction，不产生/修改任何账目。
        break;
    }
  }

  const transactions = [...byId.values()]
    // 日期降序；同日保持事件写入顺序，使刚记的账出现在当日组内靠后位置
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { transactions };
}
