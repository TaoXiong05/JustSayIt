import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAuthorizeUrl, SCOPE, exchangeCode } from '@/lib/auth/oauth';

const ORIG = {
  id: process.env.GOOGLE_CLIENT_ID,
  redirect: process.env.GOOGLE_REDIRECT_URI,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  nodeEnv: process.env.NODE_ENV,
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
  vi.stubEnv('NODE_ENV', ORIG.nodeEnv ?? 'test');
  vi.unstubAllGlobals();
});

describe('oauth', () => {
  it('authorize url 包含全部 scope 与 access_type=offline', () => {
    const url = buildAuthorizeUrl('st', 'n1');
    expect(url).toContain('openid');
    // scope 经 URLSearchParams 编码，用 decodeURIComponent 断言完整 scope URI
    // （不能只断言子串 'drive.appdata'：短别名和完整 URI 都会命中，测不出 §11.2 要求的格式）
    expect(decodeURIComponent(url)).toContain(
      'https://www.googleapis.com/auth/drive.appdata',
    );
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=st');
    expect(url).toContain('nonce=n1');
    // redirect_uri 经 URLSearchParams 编码，用 decodeURIComponent 断言原值
    expect(decodeURIComponent(url)).toContain('http://localhost:3000/api/auth/callback');
  });

  it('SCOPE 一次性请求全部 scope（§11.2）', () => {
    expect(SCOPE).toBe(
      'openid email profile https://www.googleapis.com/auth/drive.appdata',
    );
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

  it('非生产环境且传了 requestOrigin 时，redirect_uri 按请求来源动态推导（方便局域网多设备测试）', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const url = buildAuthorizeUrl('st', 'n1', 'http://192.168.1.50:3000');
    expect(decodeURIComponent(url)).toContain(
      'http://192.168.1.50:3000/api/auth/callback',
    );
    expect(decodeURIComponent(url)).not.toContain('localhost:3000');
  });

  it('生产环境即使传了 requestOrigin 也固定用 GOOGLE_REDIRECT_URI，不依赖请求来源', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const url = buildAuthorizeUrl('st', 'n1', 'http://192.168.1.50:3000');
    expect(decodeURIComponent(url)).toContain('http://localhost:3000/api/auth/callback');
    expect(decodeURIComponent(url)).not.toContain('192.168.1.50');
  });

  it('exchangeCode 同样按 requestOrigin 动态推导 redirect_uri（必须和 buildAuthorizeUrl 那一步一致）', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'ID' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await exchangeCode('CODE', 'http://192.168.1.50:3000');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get('redirect_uri')).toBe('http://192.168.1.50:3000/api/auth/callback');
  });
});

describe('refreshAccessToken', () => {
  it('用 refresh_token grant 换取 access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at-1', expires_in: 3599 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    const out = await refreshAccessToken('rt-1');
    expect(out).toEqual({ accessToken: 'at-1', expiresIn: 3599 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-1');
    expect(body.get('client_id')).toBe('client-1');
  });

  it('HTTP 失败时抛错，不泄漏 refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    await expect(refreshAccessToken('secret-rt')).rejects.toThrow(/400/);
    await expect(refreshAccessToken('secret-rt')).rejects.not.toThrow(/secret-rt/);
  });

  it('响应缺少 access_token 时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    await expect(refreshAccessToken('rt-1')).rejects.toThrow(/access_token/);
  });

  it('响应缺少 expires_in 时回退到 3600 秒', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'at-1' }) }),
    );
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    expect((await refreshAccessToken('rt-1')).expiresIn).toBe(3600);
  });
});