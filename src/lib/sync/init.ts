import { subscribe, getEventsSnapshot, hydrate } from '@/lib/ledger/store';
import { getDeviceId, type LedgerEvent } from '@/lib/ledger/events';
import { markUnsynced, getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';

// 兜底重试间隔（回归：用户反馈"提交记录，不刷新页面就一直显示等待
// 同步"）。账本变化触发的那次 syncNow() 偶尔会因为一次性的瞬时失败
// （网络抖动等 B 类错误）没能追上，如果此后再也没有别的账本变化，
// 待同步项就永远等不到下一次尝试——之前唯一的补救是用户手动刷新页面，
// 重新走一遍 initSync() 那次无条件同步。定期检查一次，只要还有未同步项
// 就补跑一次；追上后 unsyncedIds 变空，这里自然就没有实际同步动作。
const RETRY_INTERVAL_MS = 15_000;

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
 *
 * 回归：seenEventIds 基线必须等真正水合完成后再取快照，不能在这里同步
 * 调用 getEventsSnapshot()——page.tsx 里 useLedger() 也会在自己的 effect
 * 里触发一次 hydrate()，但那是从 IndexedDB 读数据的异步操作，不会在这个
 * effect 同步跑完之前落地。旧写法在这里同步取到的是"水合完成前"的空/旧
 * 快照，等 hydrate() 真正 commit() 时，订阅回调会把*全部*历史事件（包括
 * 早就同步过的）当成"新出现"，误标成待同步。多数情况下这个误判会被
 * 紧跟着的 syncNow() 自动纠正回来，用户几乎看不到；但如果这次误判恰好
 * 发生在没有有效登录态时（比如登出触发的整页刷新——见 settings/page.tsx
 * 的 window.location.href 跳转），syncNow() 会因为拿不到 access token
 * 直接失败，纠正就不会发生，误标的"待同步"会一直卡在界面上，即使那些
 * 账目其实老早就同步过了。
 *
 * 修法：initSync() 自己 await 一次 hydrate()（幂等，重复调用无副作用），
 * 确保 getEventsSnapshot() 反映的是本地 IndexedDB 里*全部*已有事件之后，
 * 才建立基线、才订阅——这样订阅之后收到的第一次通知，一定代表"基线
 * 之后真正发生的变化"，不会把历史存量事件误判成新事件。
 */
export function initSync(): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setInterval> | null = null;

  void hydrate().then(() => {
    if (cancelled) return;
    seenEventIds = new Set(getEventsSnapshot().map((e) => e.eventId));
    unsubscribe = subscribe(() => {
      const newIds = newlyCreatedOrAmendedTxIds(getEventsSnapshot());
      if (newIds.length > 0) markUnsynced(newIds);
      void syncNow().catch(() => {});
    });
    // 回归：上面的订阅只在*后续*账本变化时才触发 syncNow()——全新设备
    // 登录后本地事件流从始至终是空的（没人新建/修改过账目），永远等不到
    // 一次订阅通知，syncNow() 就永远不会被调用，Drive 上其它设备早就存在
    // 的账目也就永远不会被拉下来合并（用户反馈：换设备登录同一账号，
    // 一条记录都看不到）。这里的基线一旦建立就主动同步一次，不管本地
    // 有没有变化，新设备首次登录也能立刻把远端历史账目拉下来。
    void syncNow().catch(() => {});

    retryTimer = setInterval(() => {
      if (getSyncSnapshot().unsyncedIds.length > 0) void syncNow().catch(() => {});
    }, RETRY_INTERVAL_MS);
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
    if (retryTimer) clearInterval(retryTimer);
  };
}