import { randomBytes } from 'node:crypto';
import { buildAuthorizeUrl } from '@/lib/auth/oauth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;
  // ?reauth=1：旧 refresh token 失效后的强制重新同意（见 oauth.ts 的
  // buildAuthorizeUrl 注释）。由 SyncWarning.tsx 的 DRIVE_REAUTH_REQUIRED
  // 分支触发，不是普通登录路径。
  const forceConsent = new URL(request.url).searchParams.get('reauth') === '1';
  const url = buildAuthorizeUrl(state, nonce, origin, { forceConsent });
  // state+nonce 放同一 httpOnly cookie：state 防 CSRF，nonce 防 ID token 重放
  const cookie = `justsayit.oauth_state=${state}.${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Set-Cookie': cookie },
  });
}