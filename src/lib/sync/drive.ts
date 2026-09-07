import type { LedgerEvent } from '@/lib/ledger/events';

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const BOUNDARY = 'justsayit-sync-boundary';

export type DriveFile = { id: string; name: string };

/**
 * 每个 Drive 请求的超时。裸 fetch 没有任何默认超时——上传/列文件/下载
 * 任意一个挂住，engine.ts 里那个 `syncing` 布尔就永远回不到 false，
 * 之后每一次 syncNow() 都会在入口直接 return，**整个会话的同步彻底死掉
 * 且毫无迹象**（用户反馈原话："一个 sync 失败卡住 就会导致所有卡住"）。
 * 超时是把"卡住"降级成"失败"的唯一手段：失败会被记录、会被重试，卡住不会。
 *
 * 取 30s 而不是更短：整份覆盖上传的是本设备迄今全部事件（spec §6.1 估算
 * 五年约 3.6MB），移动网络下不该被自己的超时误杀。
 */
const REQUEST_TIMEOUT_MS = 30_000;

function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/**
 * 失败时把 Google 的错误响应体一并带进错误信息。
 *
 * 只带一个状态码在排查时几乎没用：同一个 403 既可能是"这个 access token
 * 没有 drive.appdata 授权"（body 里是 Insufficient Permission），也可能是
 * "这个 Cloud 项目压根没启用 Drive API"（body 里是 has not been used in
 * project ... or it is disabled），两者的修法完全不同，而 body 里写得很清楚
 * （用户反馈：一直 403，只能靠猜，来回试了两轮才定位到是 scope）。
 * 读 body 本身失败时保留原始状态码，不能让诊断信息反而变少。
 */
async function requestFailed(res: Response, action: string): Promise<Error> {
  let detail = '';
  try {
    // 500 而不是更短：Google 的错误体里 message 很长，机器可读的
    // reason（accessNotConfigured / insufficientPermissions 等）排在它后面，
    // 截太短正好把最有分辨力的那个字段丢掉。
    detail = (await res.text()).slice(0, 500).replace(/\s+/g, ' ').trim();
  } catch {
    // 读不到 body 就只报状态码
  }
  return new Error(`${action}失败：HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
}

/** 事件序列 → JSONL（一行一个事件），供写入 Drive 文件。 */
export function serializeEvents(events: LedgerEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

/**
 * JSONL → 事件序列。忽略空行（文件末尾换行、手工拼接产生的空行等）。
 *
 * 单行解析失败**跳过该行**，不再让整个 parseEvents 抛出。原来是
 * `.map(JSON.parse)`，任何一行坏掉就炸掉整次解析 → 整次同步，而且是
 * 永久性的：上传是整份覆盖（见 upsertOwnFile），另一台设备一次被打断的
 * 上传就能在 Drive 上留下一个末行截断的文件，此后**每一次**同步都会在
 * 同一行以同样的方式失败，那台设备之外所有设备的数据从此再也合不进来。
 * 一行读不懂就丢一行，比丢掉整份别人的账本合理得多。
 */
export function parseEvents(content: string): LedgerEvent[] {
  const events: LedgerEvent[] = [];
  let skipped = 0;
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.length === 0) continue;
    try {
      events.push(JSON.parse(line) as LedgerEvent);
    } catch {
      skipped++;
    }
  }
  // 零内容日志：只报条数，不把那行内容打出来
  if (skipped > 0) console.warn(`[justsayit] 同步：跳过 ${skipped} 行无法解析的远端事件`);
  return events;
}

export async function listOwnAppFiles(accessToken: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    pageSize: '1000',
  });
  const res = await driveFetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await requestFailed(res, 'Drive 列表请求');
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

export async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await driveFetch(`${FILES_ENDPOINT}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await requestFailed(res, 'Drive 下载');
  return res.text();
}

async function createFile(
  accessToken: string,
  name: string,
  content: string,
): Promise<void> {
  const metadata = JSON.stringify({ name, parents: ['appDataFolder'] });
  const body =
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${BOUNDARY}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    `${content}\r\n` +
    `--${BOUNDARY}--`;
  const res = await driveFetch(`${UPLOAD_ENDPOINT}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/related; boundary=${BOUNDARY}`,
    },
    body,
  });
  if (!res.ok) throw await requestFailed(res, 'Drive 创建文件');
}

async function updateFile(
  accessToken: string,
  fileId: string,
  content: string,
): Promise<void> {
  const res = await driveFetch(`${UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'text/plain',
    },
    body: content,
  });
  if (!res.ok) throw await requestFailed(res, 'Drive 更新文件');
}

/**
 * 写入本设备的日志文件（spec §7：每设备只写自己的文件，逻辑上只追加）。
 * content 是该设备迄今全部事件的完整序列化内容，不是增量——这个数据量级
 * 下（spec §6.1：五年约 3.6MB）整份覆盖比维护续写游标简单得多，也没有
 * 丢字节的风险。先查有没有已存在的同名文件，有则 PATCH 覆盖，没有则新建。
 */
export async function upsertOwnFile(
  accessToken: string,
  deviceId: string,
  content: string,
): Promise<void> {
  const name = `events-${deviceId}.jsonl`;
  const existing = await listOwnAppFiles(accessToken);
  const found = existing.find((f) => f.name === name);
  if (found) {
    await updateFile(accessToken, found.id, content);
  } else {
    await createFile(accessToken, name, content);
  }
}