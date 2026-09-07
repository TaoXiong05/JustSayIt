import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { fetchSyncVersion: vi.fn() },
}));

import { GET } from '@/app/api/sync-version/route';
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';

const req = () => new Request('http://localhost/api/sync-version');
const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.fetchSyncVersion).mockResolvedValue(3);
});
afterEach(() => vi.clearAllMocks());

describe('GET /api/sync-version', () => {
  it('已认证 → 返回自己的同步哨兵（只有 version，不含任何账本数据）', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 3 });
    expect(userRepo.fetchSyncVersion).toHaveBeenCalledWith('s1');
  });

  it('未登录 → 401，不查哨兵', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录', code: 'UNAUTHENTICATED' } },
    });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(userRepo.fetchSyncVersion).not.toHaveBeenCalled();
  });

  it('数据库不可用 → 503 SYNC_UNAVAILABLE（前端静默跳过，下个周期再试）', async () => {
    vi.mocked(userRepo.fetchSyncVersion).mockRejectedValue(new Error('db down'));
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('SYNC_UNAVAILABLE');
  });

  it('逃生舱模式 → 返回 version 0（无真实用户）', async () => {
    vi.mocked(authenticate).mockResolvedValue({ bypass: true } as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 0 });
  });
});