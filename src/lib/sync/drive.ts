import type { LedgerEvent } from '@/lib/ledger/events';

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const BOUNDARY = 'justsayit-sync-boundary';

export type DriveFile = { id: string; name: string };

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

/** JSONL → 事件序列。忽略空行（文件末尾换行、手工拼接产生的空行等）。 */
export function parseEvents(content: string): LedgerEvent[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LedgerEvent);
}

export async function listOwnAppFiles(accessToken: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    pageSize: '1000',
  });
  const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await requestFailed(res, 'Drive 列表请求');
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

export async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES_ENDPOINT}/${fileId}?alt=media`, {
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
  const res = await fetch(`${UPLOAD_ENDPOINT}?uploadType=multipart`, {
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
  const res = await fetch(`${UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
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