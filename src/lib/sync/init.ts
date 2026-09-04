import { subscribe, getEventsSnapshot } from '@/lib/ledger/store';
import { getDeviceId, type LedgerEvent } from '@/lib/ledger/events';
import { markUnsynced } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';

let seenEventIds = new Set<string>();

/**
 * 只有本设备自己产生的账目才可能"待同步"——别的设备已经把它写进了
 * 自己的 Drive 文件，我们能看到它，本身就证明它已经同步过了（那正是
 * 我们把它下载合并进来的方式）。
 * 回归：曾经不分设备，任何"这个 JS 会话第一次看到"的事件都会被标记
 * 未同步——在一台全新设备/浏览器上首次同步、合并进另一设备的历史账目
 * 后，这些账目会被误判成"待同步"，圆点永远显示空心，即使它们其实
 * 早就同步过了。
 */
function newlyCreatedOrAmendedTxIds(events: LedgerEvent[]): string[] {
  const deviceId = getDeviceId();
  const ids: string[] = [];
  for (const e of events) {
    if (seenEventIds.has(e.eventId)) continue;
    seenEventIds.add(e.eventId);
    if (
      e.deviceId === deviceId &&
      (e.kind === 'transaction_created' || e.kind === 'transaction_amended')
    ) {
      ids.push(e.payload.id);
    }
  }
  return ids;
}

/**
 * 应用启动时调用一次：账本每次变化（本地新增/修改/删除账目、排队/补跑
 * 离线输入）都触发一次同步；新出现的 transaction_created/amended 事件
 * 先标记为未同步，再异步同步（spec §7 同步时机："尽快推送，不做批量攒批"）。
 * 同步失败与否由 sync/status.ts 记录，这里不处理错误分支——UI 层的
 * 分级预警负责后续提示。
 */
export function initSync(): () => void {
  seenEventIds = new Set(getEventsSnapshot().map((e) => e.eventId));
  return subscribe(() => {
    const newIds = newlyCreatedOrAmendedTxIds(getEventsSnapshot());
    if (newIds.length > 0) markUnsynced(newIds);
    void syncNow().catch(() => {});
  });
}