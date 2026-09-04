import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';
import { decryptRefreshToken } from '@/lib/server/crypto';
import { refreshAccessToken } from '@/lib/auth/oauth';

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
    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);
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