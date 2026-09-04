import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server/db', () => ({
  prisma: {},
  dbHealth: vi.fn().mockResolvedValue(true),
}));

import { prisma, dbHealth } from '@/lib/server/db';

describe('db', () => {
  it('导出 Prisma 单例', () => {
    expect(prisma).toBeDefined();
  });

  it('dbHealth 返回布尔', async () => {
    expect(await dbHealth()).toBe(true);
  });
});