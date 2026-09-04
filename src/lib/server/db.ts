import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 仅服务端（§13.3）。被 import 进客户端 bundle 会拖入 pg 与密钥。
// PrismaClient 是懒连接：构造时不建立连接，首次查询才连。
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
});

export const prisma = new PrismaClient({ adapter });

export async function dbHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}