import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/oauth', () => ({
  buildAuthorizeUrl: vi.fn(() => 'https://accounts.google.com/o/oauth2/v2/auth?x=1'),
  exchangeCode: vi.fn(),
  verifyIdToken: vi.fn(),
}));

vi.mock('@/lib/server/user', () => ({
  userRepo: { findOrCreateUser: vi.fn() },
}));
vi.mock('@/lib/server/crypto', () => ({
  encryptRefreshToken: vi.fn((s: string) => `enc:${s}`),
}));
vi.mock('@/lib/server/session', () => ({
  signSession: vi.fn(async (u) => `jwt:${u.googleSub}`),
  buildSetCookie: vi.fn((token: string, secure: boolean) =>
    `justsayit.session=${token}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  ),
  SESSION_COOKIE: 'justsayit.session',
}));
vi.mock('@/lib/server/guard', () => ({
  authenticate: vi.fn(),
}));

import { GET as loginGET } from '@/app/api/auth/login/route';
import { GET as callbackGET } from '@/app/api/auth/callback/route';
import { GET as sessionGET } from '@/app/api/auth/session/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { buildAuthorizeUrl, exchangeCode, verifyIdToken } from '@/lib/auth/oauth';
import { userRepo } from '@/lib/server/user';
import { encryptRefreshToken } from '@/lib/server/crypto';
import { signSession } from '@/lib/server/session';
import { authenticate } from '@/lib/server/guard';

const PROFILE = { googleSub: 's1', email: 'a@b.c', name: 'A', picture: null };

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('login route', () => {
  it('302 重定向 Google 并设置 state cookie', async () => {
    const req = new Request('http://localhost:3000/api/auth/login');
    const res = await loginGET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('accounts.google.com');
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('justsayit.oauth_state=');
    expect(setCookie).toContain('HttpOnly');
  });

  it('把请求自己的 origin 传给 buildAuthorizeUrl（方便局域网多设备测试动态推导 redirect_uri）', async () => {
    const req = new Request('http://192.168.1.50:3000/api/auth/login');
    await loginGET(req);
    expect(vi.mocked(buildAuthorizeUrl).mock.calls[0][2]).toBe('http://192.168.1.50:3000');
  });
});

describe('callback route', () => {
  it('校验 state → 换 token → 验 ID token → upsert 用户 → 设 session', async () => {
    vi.mocked(exchangeCode).mockResolvedValue({ idToken: 'ID', refreshToken: 'REF' });
    vi.mocked(verifyIdToken).mockResolvedValue(PROFILE);
    const req = new Request('http://x/api/auth/callback?code=C&state=abc', {
      headers: { cookie: 'justsayit.oauth_state=abc.n1' },
    });
    const res = await callbackGET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/');
    expect(encryptRefreshToken).toHaveBeenCalledWith('REF');
    expect(userRepo.findOrCreateUser).toHaveBeenCalledWith({
      ...PROFILE,
      refreshTokenEnc: 'enc:REF',
    });
    expect(signSession).toHaveBeenCalled();
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('justsayit.session=jwt:s1');
    // exchangeCode 拿到的 origin 必须和 login 那一步 buildAuthorizeUrl 用的一致，
    // 否则 Google 会因为两步 redirect_uri 不匹配而拒绝——用请求自己的 origin
    // 天然保证这一点，不用手动传保持同步。
    expect(exchangeCode).toHaveBeenCalledWith('C', 'http://x');
  });

  it('state 不匹配 → 不换 token，重定向登录错误页', async () => {
    const req = new Request('http://x/api/auth/callback?code=C&state=WRONG', {
      headers: { cookie: 'justsayit.oauth_state=abc.n1' },
    });
    const res = await callbackGET(req);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/login?error=oauth');
    expect(exchangeCode).not.toHaveBeenCalled();
  });

  it('Google 返回 error → 重定向登录错误页', async () => {
    const req = new Request('http://x/api/auth/callback?error=access_denied', {
      headers: { cookie: 'justsayit.oauth_state=abc.n1' },
    });
    const res = await callbackGET(req);
    expect(res.headers.get('Location')).toBe('/login?error=oauth');
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});

describe('session route', () => {
  it('已认证 → 返回用户', async () => {
    vi.mocked(authenticate).mockResolvedValue(PROFILE);
    const res = await sessionGET(new Request('http://x/'));
    expect(await res.json()).toEqual({ user: PROFILE });
  });
  it('未认证 → 返回 user null', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录' } },
    });
    const res = await sessionGET(new Request('http://x/'));
    expect(await res.json()).toEqual({ user: null });
  });
});

describe('logout route', () => {
  it('清除 session cookie', async () => {
    const res = await logoutPOST();
    const setCookie = res.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('Max-Age=0');
    expect(res.status).toBe(200);
  });
});