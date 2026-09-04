import { describe, it, expect, beforeEach } from 'vitest';
import { makeQuotaService, DAILY_AI_QUOTA } from '@/lib/server/quota';
import type { DbLike } from '@/lib/server/quota';

type Row = { id: string; aiCallsToday: number; lastResetDate: string };
const rows: Row[] = [];

const fakeDb: DbLike = {
  $transaction: async (fn) => fn(fakeDb),
  user: {
    findUnique: async ({ where }: { where: { id: string } }) => {
      const r = rows.find((x) => x.id === where.id);
      return r as Awaited<ReturnType<DbLike['user']['findUnique']>>;
    },
    update: async ({ where, data }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
  },
};

beforeEach(() => {
  rows.length = 0;
  rows.push({ id: 'u1', aiCallsToday: 0, lastResetDate: '2026-09-04' });
});

describe('quota.consume', () => {
  it('配额内消费成功并扣减', async () => {
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('u1', '2026-09-04');
    expect(res.ok).toBe(true);
    expect((res as { remaining: number }).remaining).toBe(
      DAILY_AI_QUOTA - 1,
    );
    expect(rows[0].aiCallsToday).toBe(1);
  });

  it('日期变化时重置计数后再消费', async () => {
    rows[0].aiCallsToday = DAILY_AI_QUOTA - 1;
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('u1', '2026-09-05');
    expect(res.ok).toBe(true);
    expect(rows[0].lastResetDate).toBe('2026-09-05');
    expect(rows[0].aiCallsToday).toBe(1);
  });

  it('已超配额时拒绝', async () => {
    rows[0].aiCallsToday = DAILY_AI_QUOTA;
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('u1', '2026-09-04');
    expect(res.ok).toBe(false);
    expect(rows[0].aiCallsToday).toBe(DAILY_AI_QUOTA);
  });

  it('用户不存在时拒绝', async () => {
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('ghost', '2026-09-04');
    expect(res.ok).toBe(false);
  });
});