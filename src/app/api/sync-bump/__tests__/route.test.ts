import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { bumpSyncVersion: vi.fn() },
}));

import { POST } from '@/app/api/sync-bump/route';
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';

const req = () => new Request('http://localhost/api/sync-bump', { method: 'POST' });
const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.bumpSyncVersion).mockResolvedValue(4);
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/sync-bump', () => {
  it('已认证 → 哨兵 +1 并返回新版本号', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 4 });
    expect(userRepo.bumpSyncVersion).toHaveBeenCalledWith('s1');
  });

  it('未登录 → 401，不 bump', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录', code: 'UNAUTHENTICATED' } },
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(userRepo.bumpSyncVersion).not.toHaveBeenCalled();
  });

  it('数据库不可用 → 503 SYNC_UNAVAILABLE', async () => {
    vi.mocked(userRepo.bumpSyncVersion).mockRejectedValue(new Error('db down'));
    const res = await POST(req());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SYNC_UNAVAILABLE');
  });
});