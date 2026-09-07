import { subscribe, getEventsSnapshot, hydrate } from '@/lib/ledger/store';
import { getDeviceId, type LedgerEvent } from '@/lib/ledger/events';
import {
  markUnsynced,
  reconcileUnsynced,
  getSnapshot as getSyncSnapshot,
} from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';

/**
 * 兜底重试的**起始**间隔与上限。
 *
 * 原来是固定 15s 的 setInterval，两个毛病：
 * 1. 只在 unsyncedIds 非空时才跑。同步失败如果发生在**下载/合并**那一侧
 *    （本机没有待上传的东西，只是拉不到别的设备的数据），这个条件永远
 *    不成立——于是根本没有任何重试，只能等下一次账本变化或用户刷新页面。
 * 2. 持久性故障（后端数据库连不上、Drive 授权被撤销）下它会每 15 秒
 *    原地撞一次，撞到天荒地老。
 *
 * 现在改成失败即退避（15s → 30s → 60s …… 封顶 5 分钟），成功后立刻
 * 回到起始间隔；A 类失败（authError）直接不重试——重试在用户重新授权
 * 之前不可能成功，SyncWarning 里有那个入口。
 */
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 5 * 60_000;

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
 * 本设备产生的全部账目 id——未同步集合的校准基准。
 * 只认本设备的：engine.ts 上传时按 deviceId 过滤，别的设备的账目
 * 永远不会出现在 markSynced 的清除列表里（同上面那条注释的道理）。
 */
function ownTxIds(events: LedgerEvent[]): string[] {
  const deviceId = getDeviceId();
  const ids: string[] = [];
  for (const e of events) {
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
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = RETRY_BASE_MS;

  void hydrate().then(() => {
    if (cancelled) return;
    seenEventIds = new Set(getEventsSnapshot().map((e) => e.eventId));
    // 未同步集合是从上一次会话恢复出来的，可能指向本地已经不存在的账目
    // （清过 IndexedDB 等）——那种 id 永远等不到 markSynced，在这里一次性
    // 清掉（见 status.ts 的 reconcileUnsynced）。必须在水合之后：此刻
    // getEventsSnapshot() 才是本地事件的全集。
    reconcileUnsynced(ownTxIds(getEventsSnapshot()));
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

    scheduleRetry();
  });

  function scheduleRetry(): void {
    retryTimer = setTimeout(() => {
      void (async () => {
        const snapshot = getSyncSnapshot();
        // 有待上传的东西，**或者**上一次尝试留下了错误（后者才覆盖得到
        // "只是拉不下来别人的数据"这类失败）。authError 是 A 类，重试
        // 在用户重新授权之前不可能成功，不浪费请求。
        // 用真假判断而不是 `!== null`：这两个字段在部分调用路径下可能是
        // undefined，`undefined !== null` 会是 true，等于无条件重试。
        const shouldRetry =
          !snapshot.authError && (snapshot.unsyncedIds.length > 0 || Boolean(snapshot.lastError));
        if (shouldRetry) {
          try {
            await syncNow();
            retryDelay = RETRY_BASE_MS;
          } catch {
            retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
          }
        } else {
          retryDelay = RETRY_BASE_MS;
        }
        if (!cancelled) scheduleRetry();
      })();
    }, retryDelay);
  }

  return () => {
    cancelled = true;
    unsubscribe?.();
    if (retryTimer) clearTimeout(retryTimer);
  };
}