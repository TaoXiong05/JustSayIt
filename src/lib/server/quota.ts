import { prisma } from '@/lib/server/db';
import type { Prisma } from '../../generated/prisma/client';

export const DAILY_AI_QUOTA = Number(process.env.AI_DAILY_QUOTA ?? 60);

type DbUser = {
  findUnique(args: {
    where: { id: string };
  }): Promise<{ id: string; aiCallsToday: number; lastResetDate: string } | null>;
  update(args: {
    where: { id: string };
    data: { aiCallsToday?: number; lastResetDate?: string };
  }): Promise<unknown>;
};

export type DbLike = {
  $transaction<T>(fn: (tx: DbLike) => Promise<T>): Promise<T>;
  user: DbUser;
};

export type ConsumeResult =
  | { ok: true; remaining: number }
  | { ok: false; message: string };

export function todayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * per-user 每日 AI 配额（§11.5、§10.3a）。
 * 事务内「读 → 判断 → 写」原子执行：并发请求不会双买配额。
 * 仅服务端调用；route 层每次 AI 调用前 consume 一次（structure + stt 共享）。
 */
export function makeQuotaService(db: DbLike) {
  return {
    async consume(userId: string, dateKey = todayKey()): Promise<ConsumeResult> {
      const result = await db.$transaction(async (tx) => {
        const client = tx as DbLike;
        const user = await client.user.findUnique({ where: { id: userId } });
        if (!user) return { ok: false as const, message: '用户不存在' };
        let calls = user.aiCallsToday;
        let resetKey = user.lastResetDate;
        if (resetKey !== dateKey) {
          calls = 0;
          resetKey = dateKey;
        }
        if (calls >= DAILY_AI_QUOTA) {
          return {
            ok: false as const,
            message: `今日 AI 调用已达上限（${DAILY_AI_QUOTA} 次）`,
          };
        }
        await client.user.update({
          where: { id: userId },
          data: { aiCallsToday: calls + 1, lastResetDate: resetKey },
        });
        return { ok: true as const, remaining: DAILY_AI_QUOTA - (calls + 1) };
      });
      return result;
    },
  };
}

// 绑定真实 Prisma 的单例。$transaction 走 tx 客户端（真实事务）。
const defaultDb: DbLike = {
  $transaction: (fn) =>
    prisma.$transaction((tx) =>
      fn({
        $transaction: (f) => f(tx),
        user: tx.user as unknown as DbUser,
      } satisfies DbLike),
    ),
  user: prisma.user as unknown as DbUser,
};

export const quotaService = makeQuotaService(defaultDb);