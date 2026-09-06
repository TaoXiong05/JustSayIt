import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';
import { decryptRefreshToken } from '@/lib/server/crypto';
import { refreshAccessToken, DRIVE_APPDATA_SCOPE } from '@/lib/auth/oauth';

export const runtime = 'nodejs';

/**
 * POST /api/drive-token —— refresh token 换短期 access token（spec §11.3）。
 * 账本内容不经过这个路由：它只吐出一个 access token，浏览器拿着这个
 * token 直接去调 Google Drive API（见 lib/sync/drive.ts）。
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }
  if ('bypass' in auth) {
    return Response.json(
      { error: '逃生舱模式不支持 Drive 同步', code: 'DRIVE_NOT_LINKED' },
      { status: 400 },
    );
  }

  const enc = await userRepo.getRefreshTokenEnc(auth.googleSub);
  if (!enc) {
    return Response.json(
      { error: '尚未授权 Drive 访问，请重新登录', code: 'DRIVE_NOT_LINKED' },
      { status: 400 },
    );
  }

  try {
    const refreshToken = decryptRefreshToken(enc);
    const { accessToken, expiresIn, scope } = await refreshAccessToken(refreshToken);
    // 刷新成功不等于这个 token 能用：refresh token 只带得动它当初被签发时
    // 同意过的 scope，之后在 Google Cloud 里新加的 scope 不会被追认。偏偏
    // "已经授权过"的普通登录 Google 不再返回新的 refresh token，旧的那个就
    // 会一直留在库里（见 lib/server/user.ts 只在拿到新 token 时才覆盖）——
    // 结果是这个路由一路 200、每一次 Drive 调用都 403，界面上只剩一个永远
    // 不消失的"待同步"，完全看不出该去做什么（用户反馈原话：后端日志没有
    // 报错、网络返回都是 200）。这里提前拦下来，复用 DRIVE_REAUTH_REQUIRED：
    // 前端据此标记 authError，SyncWarning 直接给出"重新连接 Google Drive"的
    // 入口（走 /api/auth/login?reauth=1 的 prompt=consent，这是唯一能保证换到
    // 新 refresh token 的路径）。
    // scope 字段缺失时不做判断——无从确认就放行，别把本来好用的 token 拦掉。
    if (scope !== null && !scope.split(' ').includes(DRIVE_APPDATA_SCOPE)) {
      console.error(
        JSON.stringify({ route: 'drive-token', ok: false, error: 'missing_drive_appdata_scope' }),
      );
      return Response.json(
        {
          error: '当前授权缺少 Drive 权限，请重新连接 Google Drive',
          code: 'DRIVE_REAUTH_REQUIRED',
        },
        { status: 401 },
      );
    }
    return Response.json({ accessToken, expiresIn });
  } catch (err) {
    // 零内容日志（§10.5 原则的延伸）：只记错误类型，不带 token 内容
    console.error(
      JSON.stringify({
        route: 'drive-token',
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json(
      { error: 'Drive 授权已失效，请重新登录', code: 'DRIVE_REAUTH_REQUIRED' },
      { status: 401 },
    );
  }
}