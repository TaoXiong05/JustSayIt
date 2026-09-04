import { randomBytes } from 'node:crypto';
import { buildAuthorizeUrl } from '@/lib/auth/oauth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  const origin = host ? `${proto}://${host}` : new URL(request.url).origin;
  const url = buildAuthorizeUrl(state, nonce, origin);
  // state+nonce 放同一 httpOnly cookie：state 防 CSRF，nonce 防 ID token 重放
  const cookie = `justsayit.oauth_state=${state}.${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  return new Response(null, {
    status: 302,
    headers: { Location: url, 'Set-Cookie': cookie },
  });
}