/**
 * 同步哨兵的客户端访问（sentinel polling 的读侧）。
 *
 * 服务器 User 表有一个 `syncVersion` 整数（见 prisma/schema.prisma）。前端
 * 每 ~10s 轮询 GET /api/sync-version 读它，发现比自己记住的大，就去调
 * syncNow() 真正同步 Google Drive——轮询对象是"一个整数"，不是 Drive，
 * 所以高频轮询也极轻。写侧：AI 记账走 /api/structure 自动 bump；编辑/删除
 * 不过服务器，由前端调 bumpSyncVersion() 补一次。
 */
export async function fetchSyncVersion(): Promise<number> {
  const res = await fetch('/api/sync-version');
  if (!res.ok) {
    throw new Error(`sync-version 请求失败：HTTP ${res.status}`);
  }
  const data = (await res.json()) as { version?: number };
  return typeof data.version === 'number' ? data.version : 0;
}

/**
 * 编辑/删除账目成功后调用（fire-and-forget）：把用户的同步哨兵 +1，让其它
 * 设备前端轮询时发现变化、去同步 Drive 拉取。失败静默忽略——本地账目已落地，
 * 哨兵只是"尽快触发对端拉取"，丢一次下次轮询/下次写入仍会补上。
 */
export function bumpSyncVersion(): void {
  void fetch('/api/sync-bump', { method: 'POST' }).catch(() => {});
}