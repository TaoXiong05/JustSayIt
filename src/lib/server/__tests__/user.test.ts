import { describe, it, expect, beforeEach } from 'vitest';
import { makeUserRepo } from '@/lib/server/user';

type Row = {
  id: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  refreshTokenEnc: string | null;
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
      const row: Row = { id: `u${rows.length + 1}`, ...create };
      rows.push(row);
      return row;
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