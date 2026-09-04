import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // migrate/studio 等 CLI 走独立连接（driver adapter 只在应用运行时用）
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    path: 'prisma/migrations',
  },
});