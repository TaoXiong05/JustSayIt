import { exchangeCode, verifyIdToken } from '@/lib/auth/oauth';
import { userRepo } from '@/lib/server/user';
import { encryptRefreshToken } from '@/lib/server/crypto';
import { signSession, buildSetCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
const secure = process.env.NODE_ENV === 'production';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = (req.headers.get('cookie') ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('justsayit.oauth_state='));
  const [expectedState, expectedNonce] = (storedState?.split('=')[1] ?? '').split('.');

  if (error || !code || !expectedState || !expectedNonce || state !== expectedState) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=oauth' },
    });
  }
  // 使用过即失效
  const clearState = 'justsayit.oauth_state=; Path=/; Max-Age=0';

  try {
    const { idToken, refreshToken } = await exchangeCode(code, url.origin);
    const profile = await verifyIdToken(idToken, expectedNonce);
    const refreshTokenEnc = refreshToken ? encryptRefreshToken(refreshToken) : undefined;
    await userRepo.findOrCreateUser({ ...profile, refreshTokenEnc });
    const token = await signSession(profile);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': [buildSetCookie(token, secure), clearState].join(', '),
      },
    });
  } catch (err) {
    // 零内容日志（§10.5）：只记错误类型，不含 token/用户输入
    console.error(
      JSON.stringify({
        route: 'auth/callback',
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=oauth', 'Set-Cookie': clearState },
    });
  }
}