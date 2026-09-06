import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { getRefreshTokenEnc: vi.fn() },
}));
vi.mock('@/lib/server/crypto', () => ({ decryptRefreshToken: vi.fn() }));
// 只替身 refreshAccessToken；DRIVE_APPDATA_SCOPE 保留真实值——路由用它跟
// Google 返回的 scope 做比对，写死一份副本就失去了"两边确实是同一个常量"
// 这层保障。
vi.mock('@/lib/auth/oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/oauth')>()),
  refreshAccessToken: vi.fn(),
}));

import { POST } from '@/app/api/drive-token/route';
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';
import { decryptRefreshToken } from '@/lib/server/crypto';
import { refreshAccessToken } from '@/lib/auth/oauth';

const req = () => new Request('http://localhost/api/drive-token', { method: 'POST' });

const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.getRefreshTokenEnc).mockResolvedValue('enc-1');
  vi.mocked(decryptRefreshToken).mockReturnValue('rt-1');
  vi.mocked(refreshAccessToken).mockResolvedValue({
    accessToken: 'at-1',
    expiresIn: 3599,
    scope: 'openid email profile https://www.googleapis.com/auth/drive.appdata',
  });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/drive-token', () => {
  it('返回短期 access token', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: 'at-1', expiresIn: 3599 });
    expect(decryptRefreshToken).toHaveBeenCalledWith('enc-1');
    expect(refreshAccessToken).toHaveBeenCalledWith('rt-1');
  });

  it('未登录 → 401', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录' } },
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('逃生舱模式不提供 Drive 同步 → 400 DRIVE_NOT_LINKED', async () => {
    vi.mocked(authenticate).mockResolvedValue({ bypass: true } as never);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('DRIVE_NOT_LINKED');
  });

  it('用户从未拿到过 refresh token → 400 DRIVE_NOT_LINKED，不调 Google', async () => {
    vi.mocked(userRepo.getRefreshTokenEnc).mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('DRIVE_NOT_LINKED');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('刷出来的 token 没有 drive.appdata 授权 → 401 DRIVE_REAUTH_REQUIRED，不下发这个注定被 Drive 403 拒绝的 token（回归：Google Cloud 里新加 scope 不会让已签发的 refresh token 追认新权限，而"已授权过"的普通登录 Google 不再返回新 refresh token，旧 token 就会一直留着——症状是 /api/drive-token 一直 200、Drive 每次 403，界面只剩一个永不消失的"待同步"）', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: 'at-old-scope',
      expiresIn: 3599,
      scope: 'openid email profile', // 加 scope 之前签发的那个 refresh token
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('DRIVE_REAUTH_REQUIRED');
  });

  it('Google 没返回 scope 字段时照常下发 token（无法判定就不拦，避免误伤）', async () => {
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: 'at-1',
      expiresIn: 3599,
      scope: null,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it('刷新失败（token 已被用户在 Google 后台撤销等）→ 401 DRIVE_REAUTH_REQUIRED', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(
      new Error('Google token 刷新失败：HTTP 400'),
    );
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('DRIVE_REAUTH_REQUIRED');
  });
});