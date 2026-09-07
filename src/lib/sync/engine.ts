import { getDeviceId } from '@/lib/ledger/events';
import { readAllEvents, appendEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';
import {
  listOwnAppFiles,
  downloadFile,
  upsertOwnFile,
  serializeEvents,
  parseEvents,
} from '@/lib/sync/drive';
import { markSynced, markAuthError, markSyncFailed, clearSyncError, markSyncing, markSyncSucceeded } from '@/lib/sync/status';
import { ApiError, throwApiError } from '@/lib/apiError';

const AUTH_ERROR_CODES = new Set(['DRIVE_REAUTH_REQUIRED', 'DRIVE_NOT_LINKED']);

/** 同上（见 drive.ts 的 REQUEST_TIMEOUT_MS）：没有超时的 fetch 会把
 *  `syncing` 永久锁死，之后整个会话的同步都进不来。 */
const TOKEN_TIMEOUT_MS = 15_000;

async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/drive-token', {
    method: 'POST',
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });
  if (!res.ok) await throwApiError(res, '获取 Drive 访问令牌失败');
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error('Drive 访问令牌响应缺少 accessToken');
  return data.accessToken;
}

let syncing = false;
// 前一次同步还在飞行中时，又有新的 syncNow() 调用到达——标记"跑完这一轮
// 后再补跑一轮"，而不是直接丢弃这次调用（回归：用户反馈"提交记录，不
// 刷新页面就一直显示等待同步"——init.ts 的订阅回调每次账本变化都会调用
// 一次 syncNow()，如果这次变化恰好发生在上一轮同步仍在进行时（最典型：
// 页面刚加载、initSync() 那次无条件同步还没跑完用户就提交了一笔），
// 旧写法直接 return，这笔新账目从此再也等不到一次真正把它同步掉的机会，
// 除非之后又有别的账本变化或用户刷新页面重新触发 initSync）。
let rerunRequested = false;

/**
 * 一次完整的同步（spec §7）：
 * 1. 上传本设备迄今全部事件（整份覆盖，见 lib/sync/drive.ts 的说明）
 * 2. 列出 appDataFolder 里其它设备的文件，逐个下载
 * 3. 按 eventId 去重合并进本地 IndexedDB（复用 db.ts 既有的去重逻辑）
 * 4. 重新全量重放，让新合并进来的事件反映到账本状态里
 *
 * A 类失败（drive-token 返回 DRIVE_REAUTH_REQUIRED/DRIVE_NOT_LINKED）
 * 标记 authError，不清未同步集合；其它错误（网络不可用等）视为 B 类，
 * 同样不清未同步集合，交给调用方（init.ts/UI 的重试按钮）决定何时重试。
 */
export async function syncNow(): Promise<void> {
  if (syncing) {
    rerunRequested = true;
    return;
  }
  syncing = true;
  markSyncing(true); // 让状态点立刻变成转圈 + "Syncing…"（即时状况，见 status.ts）
  try {
    do {
      rerunRequested = false;
      try {
        await runSyncOnce();
        clearSyncError();
        // 一次 runSyncOnce 成功 = 一次成功反馈（不管这一批清了几条账目）。
        // 放在这里而不是 markSynced 里，就是为了把"同步成功"这个反馈的
        // 粒度定在一次同步、而不是每一条账目——批量成功的动画不重复。
        markSyncSucceeded();
      } catch (err) {
        // 在这之前，同步失败是彻底不可见的：调用方（init.ts 的订阅回调、
        // 那次无条件同步、兜底定时器）一律 `.catch(() => {})` 吞掉，而
        // Drive 侧的失败（上传/列文件/下载，都是客户端直接打 googleapis.com、
        // 不经过本项目后端）既不写任何状态也不打日志——界面上只剩一个永远
        // 不消失的"待同步"，"还没试"和"试了但失败"完全分不出来
        // （用户反馈原话："后端日志没有报错，网络返回都是 200，为什么
        // 前端一直显示待同步"）。这里把原因记进同步状态 + 打一条 console
        // 警告，再照原样往上抛，不改变调用方既有的错误处理契约。
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[justsayit] 同步失败：', message, err);
        markSyncFailed(message);
        throw err;
      }
    } while (rerunRequested);
  } finally {
    syncing = false;
    markSyncing(false); // 同步流程结束（成功或失败都回落到待同步/已同步态）
  }
}

async function runSyncOnce(): Promise<void> {
  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    if (err instanceof ApiError && err.code && AUTH_ERROR_CODES.has(err.code)) {
      markAuthError();
    }
    throw err;
  }

  const deviceId = getDeviceId();
  const allLocalEvents = await readAllEvents();
  const ownEvents = allLocalEvents.filter((e) => e.deviceId === deviceId);

  await upsertOwnFile(accessToken, deviceId, serializeEvents(ownEvents));
  // markSynced 清的是 status.ts 里的 unsyncedIds 集合，那个集合存的是
  // transaction id（payload.id，见 sync/init.ts 的 markUnsynced 调用），
  // 不是 event 自身的 eventId——两者是不同的 UUID 空间，传错了会导致
  // markSynced 永远清不掉任何 id：sync 状态点/圆点会显示"永远未同步"，
  // 即使上传其实已经成功。
  const ownTxIds = ownEvents
    .filter((e) => e.kind === 'transaction_created' || e.kind === 'transaction_amended')
    .map((e) => e.payload.id);
  markSynced(ownTxIds);

  const files = await listOwnAppFiles(accessToken);
  const ownFileName = `events-${deviceId}.jsonl`;
  const otherFiles = files.filter((f) => f.name !== ownFileName && f.name.startsWith('events-'));

  if (otherFiles.length > 0) {
    // allSettled 而不是 all：Promise.all 一个 reject 就整体 reject，等于
    // **一台设备的文件读不下来，所有其它设备的数据都合不进来**——而且是
    // 永久性的，每次重试都会在同一个文件上以同样的方式失败。这正是
    // "一个 sync 失败卡住就会导致所有卡住"里最实在的一条。
    // 现在先把能读到的全部合并落地，再把失败的部分作为错误抛出去（顺序
    // 很重要：先保住已经取得的进展，再报告失败）。
    const results = await Promise.allSettled(
      otherFiles.map((f) => downloadFile(accessToken, f.id)),
    );
    const remoteEvents = results.flatMap((r) =>
      r.status === 'fulfilled' ? parseEvents(r.value) : [],
    );
    if (remoteEvents.length > 0) {
      await appendEvents(remoteEvents); // 已按 eventId 去重（db.ts 既有逻辑）
      await hydrate();
    }
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      const reason = failures[0].reason;
      throw new Error(
        `${failures.length}/${otherFiles.length} 个远端设备文件下载失败：` +
          (reason instanceof Error ? reason.message : String(reason)),
      );
    }
  }
}