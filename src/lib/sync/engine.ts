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
import { markSynced, markAuthError } from '@/lib/sync/status';
import { ApiError, throwApiError } from '@/lib/apiError';

const AUTH_ERROR_CODES = new Set(['DRIVE_REAUTH_REQUIRED', 'DRIVE_NOT_LINKED']);

async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/drive-token', { method: 'POST' });
  if (!res.ok) await throwApiError(res, '获取 Drive 访问令牌失败');
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error('Drive 访问令牌响应缺少 accessToken');
  return data.accessToken;
}

let syncing = false;

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
  if (syncing) return;
  syncing = true;
  try {
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
      const remoteEvents = (
        await Promise.all(otherFiles.map((f) => downloadFile(accessToken, f.id)))
      ).flatMap(parseEvents);
      if (remoteEvents.length > 0) {
        await appendEvents(remoteEvents); // 已按 eventId 去重（db.ts 既有逻辑）
        await hydrate();
      }
    }
  } finally {
    syncing = false;
  }
}