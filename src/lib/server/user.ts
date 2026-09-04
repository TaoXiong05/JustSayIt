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
};

type DbLike = {
  user: {
    upsert(args: UpsertArgs): Promise<UserRow>;
    findUnique(args: {
      where: { googleSub: string };
    }): Promise<{ refreshTokenEnc: string | null } | null>;
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
      };
    },
    findUnique: (args) =>
      prisma.user.findUnique({
        where: args.where,
        select: { refreshTokenEnc: true },
      }),
  },
};

export const userRepo = makeUserRepo(defaultDb);