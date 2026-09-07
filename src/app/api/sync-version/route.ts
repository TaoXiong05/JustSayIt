import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

/**
 * GET /api/sync-version —— 同步哨兵读取（sentinel polling 的读侧）。
 *
 * 前端每 ~10s 调一次，只返回一个整数（用户的 syncVersion），**不碰 Drive、
 * 不换 access token、不含任何账本内容**——这是"轻量轮询"的核心：轮询对象是
 * 数据库里一个整列，而不是重活。前端发现返回值比自己记住的大，才去调
 * syncNow() 真正同步 Google Drive。
 *
 * 安全：仅认证用户可读自己的版本；响应体只有 version，无数据泄露面。
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }
  // 逃生舱模式没有真实用户，直接给 0（前端视为"从未变化"即可）。
  if ('bypass' in auth) {
    return Response.json({ version: 0 });
  }

  let version: number | null;
  try {
    version = await userRepo.fetchSyncVersion(auth.googleSub);
  } catch (err) {
    console.error(
      JSON.stringify({
        route: 'sync-version',
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json(
      { error: '同步状态暂时不可用，请稍后重试', code: 'SYNC_UNAVAILABLE' },
      { status: 503 },
    );
  }
  return Response.json({ version: version ?? 0 });
}