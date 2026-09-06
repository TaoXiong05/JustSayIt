import { describe, it, expect, vi } from 'vitest';

const { dbHealth } = vi.hoisted(() => ({ dbHealth: vi.fn() }));
vi.mock('@/lib/server/db', () => ({ dbHealth }));

import { GET } from '@/app/api/health/route';

describe('GET /api/health（Plan 6 部署探活接口）', () => {
  it('数据库可达时返回 200 { status: "ok" }', async () => {
    dbHealth.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('数据库不可达时返回 503 { status: "error" }', async () => {
    dbHealth.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: 'error' });
  });
});
