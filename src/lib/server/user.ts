import { prisma } from '@/lib/server/db';
import type { Prisma } from '../../generated/prisma/client';

export type UserProfile = {
  id: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

type Input = {
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  refreshTokenEnc?: string;
};

/** 用 Prisma 生成的输入类型定义 upsert 契约，保证 fake 与真实 client 同构 */
type UpsertArgs = {
  where: { googleSub: string };
  create: Prisma.UserCreateInput;
  update: Prisma.UserUpdateInput;
};

type UserRow = {
  id: string;
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
  refreshTokenEnc: string | null;
  syncVersion: number;
};

type DbLike = {
  user: {
    upsert(args: UpsertArgs): Promise<UserRow>;
    findUnique(args: {
      where: { googleSub: string };
    }): Promise<{ refreshTokenEnc: string | null } | null>;
    /** 哨兵 +1（原子自增），返回新值；用户不存在返回 null。 */
    updateSyncVersion(args: {
      where: { googleSub: string };
    }): Promise<{ syncVersion: number } | null>;
    /** 读数哨兵（只 select 这一列，点查）。 */
    getSyncVersion(args: {
      where: { googleSub: string };
    }): Promise<{ syncVersion: number } | null>;
  };
};

/**
 * 按 googleSub 查找或创建用户（§11.5）。
 * 已存在则**每次覆盖更新** email/name/picture（规则 2：邮箱可变更，必须刷新），
 * refreshTokenEnc 仅在传入且非空时更新（避免登录但未授权 offline 时清掉旧 token）。
 * 工厂模式便于测试注入 fake db。
 */
export function makeUserRepo(db: DbLike) {
  return {
    async findOrCreateUser(input: Input): Promise<UserProfile> {
      const { googleSub, email, name, picture, refreshTokenEnc } = input;
      const update: Prisma.UserUpdateInput = { email, name, picture };
      if (refreshTokenEnc) update.refreshTokenEnc = refreshTokenEnc;
      const row = await db.user.upsert({
        where: { googleSub },
        create: {
          googleSub,
          email,
          name,
          picture,
          ...(refreshTokenEnc ? { refreshTokenEnc } : {}),
        },
        update,
      });
      return {
        id: row.id,
        googleSub: row.googleSub,
        email: row.email,
        name: row.name,
        picture: row.picture,
      };
    },

    async getRefreshTokenEnc(googleSub: string): Promise<string | null> {
      const row = await db.user.findUnique({ where: { googleSub } });
      return row?.refreshTokenEnc ?? null;
    },

    /** 同步哨兵 +1（用户任意设备有真实账本写入时调用），返回新版本号。 */
    async bumpSyncVersion(googleSub: string): Promise<number | null> {
      const row = await db.user.updateSyncVersion({ where: { googleSub } });
      return row?.syncVersion ?? null;
    },

    /** 读当前同步哨兵（供前端轻量轮询，只出一个整数）。 */
    async fetchSyncVersion(googleSub: string): Promise<number | null> {
      const row = await db.user.getSyncVersion({ where: { googleSub } });
      return row?.syncVersion ?? null;
    },
  };
}

const defaultDb: DbLike = {
  user: {
    upsert: async (args) => {
      const row: Prisma.UserGetPayload<object> = await prisma.user.upsert(args);
      return {
        id: row.id,
        googleSub: row.googleSub,
        email: row.email,
        name: row.name,
        picture: row.picture,
        refreshTokenEnc: row.refreshTokenEnc,
        syncVersion: row.syncVersion,
      };
    },
    findUnique: (args) =>
      prisma.user.findUnique({
        where: args.where,
        select: { refreshTokenEnc: true },
      }),
    updateSyncVersion: (args) =>
      prisma.user.update({
        where: args.where,
        data: { syncVersion: { increment: 1 } },
        select: { syncVersion: true },
      }),
    getSyncVersion: (args) =>
      prisma.user.findUnique({
        where: args.where,
        select: { syncVersion: true },
      }),
  },
};

export const userRepo = makeUserRepo(defaultDb);