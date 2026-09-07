import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

/**
 * POST /api/sync-bump —— 同步哨兵写侧（+1）。
 *
 * 只在"用户某台设备对账本有真实写入，但该写入不经过服务器"时由前端调用：
 * 编辑/删除账目是本地 IndexedDB 事件 + 直接写 Drive，没有天然经过后端的
 * 机会（AI 记账走 /api/structure，那里会自动 bump）。bump 后其它设备前端
 * 轮询 /api/sync-version 会看到版本变大，从而去同步 Drive 拉取这次变化。
 *
 * 安全：仅认证用户可 bump 自己；无副作用之外，响应只含新版本号。
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }
  if ('bypass' in auth) {
    return Response.json({ version: 0 });
  }

  let version: number | null;
  try {
    version = await userRepo.bumpSyncVersion(auth.googleSub);
  } catch (err) {
    console.error(
      JSON.stringify({
        route: 'sync-bump',
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