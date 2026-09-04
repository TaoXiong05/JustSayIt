import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAuthorizeUrl, SCOPE, exchangeCode } from '@/lib/auth/oauth';

const ORIG = {
  id: process.env.GOOGLE_CLIENT_ID,
  redirect: process.env.GOOGLE_REDIRECT_URI,
  secret: process.env.GOOGLE_CLIENT_SECRET,
};

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-1');
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/auth/callback');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-1');
});
afterEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', ORIG.id ?? '');
  vi.stubEnv('GOOGLE_REDIRECT_URI', ORIG.redirect ?? '');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', ORIG.secret ?? '');
  vi.unstubAllGlobals();
});

describe('oauth', () => {
  it('authorize url 包含全部 scope 与 access_type=offline', () => {
    const url = buildAuthorizeUrl('st', 'n1');
    expect(url).toContain('openid');
    expect(url).toContain('drive.appdata');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=st');
    expect(url).toContain('nonce=n1');
    // redirect_uri 经 URLSearchParams 编码，用 decodeURIComponent 断言原值
    expect(decodeURIComponent(url)).toContain('http://localhost:3000/api/auth/callback');
  });

  it('SCOPE 一次性请求全部 scope（§11.2）', () => {
    expect(SCOPE).toBe('openid email profile drive.appdata');
  });

  it('exchangeCode 请求 token endpoint 并解析 id_token / refresh_token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id_token: 'ID', refresh_token: 'REF' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await exchangeCode('CODE');
    expect(r).toEqual({ idToken: 'ID', refreshToken: 'REF' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('oauth2.googleapis.com/token');
    const body = init.body as URLSearchParams;
    expect(body.get('code')).toBe('CODE');
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('grant_type')).toBe('authorization_code');
  });

  it('token endpoint 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(exchangeCode('BAD')).rejects.toThrow();
  });

  it('缺少 googlle 配置时抛错', () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    expect(() => buildAuthorizeUrl('st', 'n1')).toThrow();
  });
});