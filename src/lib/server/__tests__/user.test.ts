import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeUserRepo } from '@/lib/server/user';

type Row = {
  id: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  refreshTokenEnc: string | null;
  syncVersion: number;
};
const rows: Row[] = [];

const fakeDb = {
  user: {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { googleSub: string };
      create: Omit<Row, 'id'>;
      update: Omit<Partial<Row>, 'id'>;
    }) => {
      const existing = rows.find((r) => r.googleSub === where.googleSub);
      if (existing) {
        const merged: Row = { ...existing, ...update, id: existing.id };
        Object.assign(existing, merged);
        return merged;
      }
      const row: Row = { id: `u${rows.length + 1}`, ...create, syncVersion: 0 };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { googleSub: string } }) => {
      const r = rows.find((x) => x.googleSub === where.googleSub);
      return r ? { refreshTokenEnc: r.refreshTokenEnc } : null;
    },
    updateSyncVersion: async ({ where }: { where: { googleSub: string } }) => {
      const r = rows.find((x) => x.googleSub === where.googleSub);
      if (!r) return null;
      r.syncVersion += 1;
      return { syncVersion: r.syncVersion };
    },
    getSyncVersion: async ({ where }: { where: { googleSub: string } }) => {
      const r = rows.find((x) => x.googleSub === where.googleSub);
      return r ? { syncVersion: r.syncVersion } : null;
    },
  },
};

beforeEach(() => {
  rows.length = 0;
});

describe('findOrCreateUser', () => {
  it('新用户时创建', async () => {
    const repo = makeUserRepo(fakeDb);
    const u = await repo.findOrCreateUser({
      googleSub: 's1',
      email: 'a@b.c',
      name: 'A',
      picture: null,
    });
    expect(u.googleSub).toBe('s1');
    expect(rows).toHaveLength(1);
  });

  it('已存在时更新 email（每次登录覆盖）', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null });
    await repo.findOrCreateUser({
      googleSub: 's1',
      email: 'new@b.c',
      name: 'A',
      picture: null,
    });
    expect(rows[0].email).toBe('new@b.c');
  });

  it('refreshTokenEnc 仅在传入时更新', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({
      googleSub: 's1',
      email: 'a@b.c',
      name: 'A',
      picture: null,
      refreshTokenEnc: 'ENC',
    });
    expect(rows[0].refreshTokenEnc).toBe('ENC');
    await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null });
    expect(rows[0].refreshTokenEnc).toBe('ENC');
  });
});

describe('getRefreshTokenEnc', () => {
  it('返回该用户的加密 refresh token', async () => {
    const db = {
      user: {
        upsert: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ refreshTokenEnc: 'enc-blob' }),
        updateSyncVersion: vi.fn(),
        getSyncVersion: vi.fn(),
      },
    };
    const repo = makeUserRepo(db);
    expect(await repo.getRefreshTokenEnc('sub-1')).toBe('enc-blob');
    expect(db.user.findUnique).toHaveBeenCalledWith({ where: { googleSub: 'sub-1' } });
  });

  it('用户不存在或从未拿到过 refresh token 时返回 null', async () => {
    const db = {
      user: {
        upsert: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        updateSyncVersion: vi.fn(),
        getSyncVersion: vi.fn(),
      },
    };
    const repo = makeUserRepo(db);
    expect(await repo.getRefreshTokenEnc('sub-none')).toBeNull();
  });
});
describe('syncVersion 哨兵（bumpSyncVersion / fetchSyncVersion）', () => {
  it('bumpSyncVersion 原子 +1 并返回新值', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({
      googleSub: 's1',
      email: null,
      name: null,
      picture: null,
    });
    expect(await repo.bumpSyncVersion('s1')).toBe(1);
    expect(await repo.bumpSyncVersion('s1')).toBe(2);
    expect(rows[0].syncVersion).toBe(2);
  });

  it('fetchSyncVersion 返回当前哨兵值', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({
      googleSub: 's1',
      email: null,
      name: null,
      picture: null,
    });
    await repo.bumpSyncVersion('s1');
    expect(await repo.fetchSyncVersion('s1')).toBe(1);
  });

  it('用户不存在时 bump/fetch 都返回 null（不报错）', async () => {
    const repo = makeUserRepo(fakeDb);
    expect(await repo.bumpSyncVersion('nobody')).toBeNull();
    expect(await repo.fetchSyncVersion('nobody')).toBeNull();
  });
});