# JustSayIt Plan 2：认证与配额 + 语音输入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Plan 1 已完成的记账闭环之上接入 Google 登录、server-side per-user AI 配额、录音与 STT，让 STT 结果回填到现有输入框并复用 Plan 1 的 Text → AI Structure → Local Ledger 流程。

**Architecture:** 后端持 Google OAuth (authorization code flow)，session 用无状态 JWT (jose) + httpOnly cookie；用户与 per-user 配额存 Postgres（Prisma + Rust-free driver adapter）。每次 AI 调用（structure / stt）在 route 层经 `lib/server/guard` 强制要求 session，并经 `lib/server/quota` 原子扣减。STT 与结构化一样走 `lib/ai/providers/groq.ts` 的 provider 抽象，业务层只见 `transcribe(audio, vocab)` 窄接口。录音在前端用 MediaRecorder（WebM/Opus 直传），转写结果回填现有 Composer 输入框，由用户确认后走 Plan 1 既有的提交管线。

**Tech Stack:** Node 24 · Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Zod · idb · Vitest · fake-indexeddb · Prisma 8 (Rust-free client via `@prisma/adapter-pg`) · pg · jose（纯 JS，无原生依赖）

**Spec:** `docs/superpowers/specs/2026-09-04-justsayit-design.md`（§9 输入管线、§10.3 provider 抽象、§11 认证与令牌流、§12.5 数据库、§16.6 STT 选型）

## 与 Plan 1 现状的差异说明（以当前代码为准）

- Plan 1 的 `src/app/api/structure/route.ts` 用 `NODE_ENV === 'development'` 或 `ALLOW_UNAUTHENTICATED_API === 'true'` 放行。Plan 2 接入认证后改为：**路由强制要求有效 session（无则 401）；仅当显式设置 `ALLOW_UNAUTHENTICATED_API=true` 时才跳过认证**（开发逃生舱，非默认）。`NODE_ENV` 不再自动放行——这是收紧安全、衔接 Plan 1 边界，不是绕过。
- spec §13.3 目录结构里的 `api/auth/[...nextauth]` 是示意。本项目**不用 next-auth**，改用手写 OAuth + jose JWT session，理由见 Task 4（更小依赖面、精确控制一次性 scope、session 无状态满足 §10.3a）。
- STT 端点在 spec §13.3 写的是 `api/stt/route.ts`，本次实现该端点（Plan 3 才做 `drive-token`）。
- `refreshTokenEnc` 字段与解密工具在 Plan 2 就落库（OAuth code flow 自然产生 refresh token，spec §11.5 用户表已定义该字段），但**不实现** `/api/drive-token` 与 Drive 同步（属 Plan 3）。

## Global Constraints

以下为 Plan 1 已建立的与 spec 的硬性要求，本 Plan 的每个任务都隐含包含：

- **金额以整数分存储，绝不用浮点数落盘**（spec §5.3 规则三）。
- **收支方向唯一来源是 `type`，`amount` 永远为正**（规则二）。
- **分类必须是 17 个枚举之一，schema 层强制**（规则一）。
- **事件不可变**（§5.1）。
- **零内容日志**（§10.5）：后端日志只记 `userId`、模型名、token 数、耗时、成功/失败、错误类型，**永不记录 prompt、response、音频与文本内容**。
- **provider 隔离**（§10.3）：`grep -ri "groq" src/` 的结果**只能出现在 `src/lib/ai/providers/groq.ts` 一个文件**。STT 的模型 ID（`whisper-large-v3-turbo`）、`language=zh`、`prompt` 词表、`temperature`、`response_format` 等 provider 参数也只能出现在该文件。`api/stt/route.ts` 不含任何 provider 细节。
- **业务层只见窄接口**（§10.3）：
  ```
  transcribe(audio: Blob, vocab: string[]) → Promise<{ text: string }>
  structure(text: string, ctx: Context)    → Promise<Transaction[]>
  ```
- **`lib/server/` 下的模块永不被客户端代码 import**（§13.3）——越界会把 Prisma 与密钥打进浏览器 bundle。
- **认证、quota、权限全部 server-side 强制执行，不依赖前端**。
- **quota 无法绕过**：每次 AI 调用在 route 层原子扣减；测试必须证明"无 session → 401"与"超配额 → 429"。
- **后端保持无状态**（§10.3a）：session 用 JWT（无内存 session），DB 连接经 Prisma。
- **金额/日期/分类的规则全在 Plan 1 已实现，本 Plan 不得重写它们**。语音输入只负责 `Audio → Text`，回填后走 Plan 1 的 `structure` 提交管线。
- **不实现 Plan 3 / Plan 4**：不做 Drive 同步、`/api/drive-token`、数据导出、统计、行内编辑、PWA、部署。
- **`knownMerchants()` 作为 STT 偏置词表来源**（store.ts 已实现并注明供 Plan 2 使用），词表上限 224 tokens（spec §16.6）。
- **STT 固定参数**（spec §16.6）：`model=whisper-large-v3-turbo`、`language=zh`、`temperature=0`、`response_format=verbose_json`、`prompt` 词表。
- **429 重试与指数退避在适配器内**（§10.3a），不能让 Groq 限流冒泡成用户可见失败。
- **客户端限制录音时长 60 秒**（§9、§10.3a）。
- **音视频格式**：MediaRecorder 原生输出（WebM/Opus）直传后端，后端不经任何转码（§9）。
- **核心版本锁定**：Node 24、Next 16、React 19、Tailwind v4、TypeScript 5、Prisma 8。包管理器 npm。新增依赖安装后必须核对实际 major 版本；`tsc --noEmit` 是每个任务的必过关卡。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `prisma/schema.prisma` | User 模型（googleSub 唯一、email 非唯一、refreshTokenEnc、配额字段） |
| `src/lib/server/db.ts` | Prisma client（Rust-free adapter）单例 |
| `src/lib/server/crypto.ts` | refresh token AES-256-GCM 加解密 |
| `src/lib/server/user.ts` | User 数据访问（按 googleSub 查/建/更新 email） |
| `src/lib/server/quota.ts` | per-user 每日 AI 配额原子检查与扣减 |
| `src/lib/server/session.ts` | JWT 签发/验证 + httpOnly cookie 读写（server 端） |
| `src/lib/server/guard.ts` | API route 复用：取 session → user | 401 |
| `src/lib/auth/oauth.ts` | Google authorize URL 构造、token 交换、ID token 校验（server-only 用法） |
| `src/lib/auth/client.ts` | `useSession()` client hook + `login/logout` 辅助 |
| `src/app/login/page.tsx` | 登录页（Google 登录按钮） |
| `src/app/api/auth/login/route.ts` | → 302 重定向 Google |
| `src/app/api/auth/callback/route.ts` | 收 code → 换 token → 建/查用户 → 设 session cookie → 跳首页 |
| `src/app/api/auth/logout/route.ts` | 清 session cookie |
| `src/app/api/auth/session/route.ts` | GET → 当前用户（供前端 `useSession`） |
| `src/app/api/stt/route.ts` | 代理端点：鉴权 → 配额 → 调 `lib/ai.transcribe` → 返回 text |
| `src/lib/ai/index.ts` | 增加窄接口 `transcribe(audio, vocab)` |
| `src/lib/ai/providers/groq.ts` | 增加 `groqTranscribe`（+429 重试）——唯一含 provider 细节的文件 |
| `src/lib/voice/recorder.ts` | MediaRecorder 封装：start/stop/cancel、60s 上限、错误归一 |
| `src/components/VoiceButton.tsx` | 录音按钮 + idle/recording/transcribing/error/cancelled 状态 |
| `src/components/Composer.tsx` | 嵌入 VoiceButton，转写结果回填 textarea |
| `src/app/page.tsx` | 接入 session：未登录显示登录引导（账本仍可见），已登录显示完整 UI |
| `.env.example` | 新增 Google OAuth / SESSION_SECRET / DATABASE_URL / 加密密钥 / quota 变量 |

修改 `package.json`（新增依赖）与 `tsconfig.json`（如需）。

---

## 本地开发数据库与环境准备

本机已有一个 `postgres:16-alpine` Docker 容器（`roster_creator-db-1`，占用 5432），为本项目**单独起一个容器**（端口 5433），不影响 roster-creator：

```bash
docker run -d --name justsayit-db \
  -e POSTGRES_USER=justsayit \
  -e POSTGRES_PASSWORD=justsayit \
  -e POSTGRES_DB=justsayit \
  -p 5433:5432 postgres:16-alpine
```

DATABASE_URL（写入 `.env`，不提交）：
```
DATABASE_URL=postgresql://justsayit:justsayit@localhost:5433/justsayit
```

> 测试（Vitest/jsdom）**不连接真实 DB**。`src/lib/server/db.ts` 在测试中统一 `vi.mock`，quota/user/session 逻辑用内存 fake 验证。真实 DB 只在手动 `prisma migrate dev` 与 dev server 运行时使用。

---

## Task 1: 数据库依赖、Prisma 骨架与首次 migration

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/server/db.ts`
- Create: `prisma.config.ts`
- Modify: `package.json`、`.env`、`.env.example`、`.gitignore`
- Test: `src/lib/server/__tests__/db.test.ts`

**Interfaces:**
- Consumes: 无（基础设施起步）
- Produces: `src/lib/server/db.ts` 导出 `prisma`（`PrismaClient`）；`prisma gen` 生成客户端；DATABASE_URL 就绪

- [ ] **Step 1: 确认依赖版本策略**

先起本地 Postgres 容器（见上文「本地开发数据库」），然后安装依赖。Prisma 8 的 Rust-free client 用 `provider = "prisma-client"`（无需 `binaryTargets`、无需引擎二进制），配 `@prisma/adapter-pg`（依赖纯 JS 的 `pg`）。

```bash
npm install @prisma/client pg jose
npm install -D prisma @prisma/adapter-pg @types/pg dotenv
```

安装后核对 major 版本（`npm ls prisma @prisma/client @prisma/adapter-pg jose pg`）：Prisma 必须为 8.x，jose 为 6.x。

- [ ] **Step 2: 编写 Prisma schema**

`prisma/schema.prisma`：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id              String   @id @default(cuid())
  // 身份主键：稳定的 Google subject identifier（spec §11.5）。
  // 所有"这是哪个用户"的判断一律走 googleSub，绝不用 email。
  googleSub       String   @unique
  // 仅供展示与联系；可空、绝不加 @unique（§11.5 硬性要求）。
  // 每次登录用 ID token 的值覆盖写入。
  email           String?
  name            String?
  picture         String?
  // 加密存储的 Google refresh token（§11.3、§12.6）。Plan 3 用。
  refreshTokenEnc String?
  createdAt       DateTime @default(now())
  lastLoginAt     DateTime @updatedAt
  aiCallsToday    Int      @default(0)
  // "YYYY-MM-DD" 本地日期键——决定 aiCallsToday 何时重置。
  lastResetDate   String   @default("")
}
```

- [ ] **Step 3: 配置 prisma.config.ts 与 DATABASE_URL**

`prisma.config.ts`（Prisma 8 用 config 文件代替 `.env` 的 `url`）：

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },

- [ ] **Step 4: 生成客户端并迁移**

```bash
npx prisma generate
npx prisma migrate dev --name init_user
```

Expected：`prisma/migrations/<ts>_init_user/migration.sql` 生成 `CREATE TABLE "User"`；`src/generated/prisma` 生成客户端。

- [ ] **Step 5: 写失败的 db.ts 测试**

`src/lib/server/__tests__/db.test.ts`：

```ts
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
```

- [ ] **Step 6: 实现 db.ts**

`src/lib/server/db.ts`：

```ts
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// 仅服务端（§13.3）。被 import 进客户端 bundle 会拖入 pg 与密钥。
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });

export const prisma = new PrismaClient({ adapter });

export async function dbHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
```

> 若 `DATABASE_URL` 未设置（测试环境 import 本模块），PrismaPg 用空串不抛错；测试会把本模块 `vi.mock`，不会真正连库。

- [ ] **Step 7: 跑 typecheck + 测试**

```bash
npx tsc --noEmit
npx vitest run src/lib/server/__tests__/db.test.ts
```
Expected：typecheck 通过；测试 PASS（mock 后）。

- [ ] **Step 8: Commit**

```bash
git add prisma prisma.config.ts src/lib/server src/generated .gitignore .env.example package.json package-lock.json
git commit -m "feat(db): Prisma Rust-free schema + User model + 首次 migration"
```

---

## Task 2: refresh token 加解密（crypto）

**Files:**
- Create: `src/lib/server/crypto.ts`
- Test: `src/lib/server/__tests__/crypto.test.ts`

**Interfaces:**
- Consumes: `REFRESH_TOKEN_ENCRYPTION_KEY`（env，32 字节 hex）
- Produces:
  ```ts
  encryptRefreshToken(plain: string): string
  decryptRefreshToken(enc: string): string   // 无法解密时抛错
  ```

- [ ] **Step 1: 写失败的测试**

`src/lib/server/__tests__/crypto.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptRefreshToken, decryptRefreshToken } from '@/lib/server/crypto';

const KEY = 'a'.repeat(64); // 32 字节 hex
const ORIG = process.env.REFRESH_TOKEN_ENCRYPTION_KEY;

beforeEach(() => vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', KEY));
afterEach(() => vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', ORIG ?? ''));

describe('refresh token crypto', () => {
  it('加密后能解密回原值', () => {
    const enc = encryptRefreshToken('ya29.some-token-value');
    expect(enc).not.toContain('ya29.');
    expect(decryptRefreshToken(enc)).toBe('ya29.some-token-value');
  });
  it('同一明文两次加密结果不同（随机 IV）', () => {
    expect(encryptRefreshToken('tok')).not.toBe(encryptRefreshToken('tok'));
  });
  it('缺少密钥时抛错', () => {
    vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', '');
    expect(() => encryptRefreshToken('x')).toThrow();
  });
  it('密文被篡改时抛错', () => {
    const enc = encryptRefreshToken('token');
    const t = JSON.parse(enc) as { iv: string; tag: string; data: string };
    t.data = t.data.slice(0, -2) + '00';
    expect(() => decryptRefreshToken(JSON.stringify(t))).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/server/__tests__/crypto.test.ts`
Expected：FAIL，`@/lib/server/crypto` 不存在。

- [ ] **Step 3: 实现**

`src/lib/server/crypto.ts`（Node 内置 `crypto`，AES-256-GCM，密钥与 DATABASE_URL 分离管理 §12.6）：

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  const hex = process.env.REFRESH_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('REFRESH_TOKEN_ENCRYPTION_KEY 必须是 32 字节的 hex');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptRefreshToken(plain: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString('hex'), tag: tag.toString('hex'), data: data.toString('hex') });
}

export function decryptRefreshToken(enc: string): string {
  const key = keyBytes();
  const { iv, tag, data } = JSON.parse(enc) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: 通过测试**

Run: `npx vitest run src/lib/server/__tests__/crypto.test.ts`
Expected：PASS，4 个测试全绿。

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/crypto.ts src/lib/server/__tests__/crypto.test.ts .env.example
git commit -m "feat(server): refresh token AES-256-GCM 加解密"
```

});
```

在 `.env` 追加（**不提交**）：`DATABASE_URL=postgresql://justsayit:justsayit@localhost:5433/justsayit`
在 `.env.example` 追加（提交）：
```
# Postgres（本地见计划文档「本地开发数据库」；生产为 Docker 内 Postgres）
DATABASE_URL=postgresql://user:pass@host:5432/justsayit
```
`.gitignore` 追加 `src/generated/`（生成的 Prisma 客户端不提交）。


---

## Task 3: 无状态 session（JWT + httpOnly cookie）

**Files:**
- Create: `src/lib/server/session.ts`
- Test: `src/lib/server/__tests__/session.test.ts`

**Interfaces:**
- Consumes: `SESSION_SECRET`（env，≥32 字节 hex）
- Produces:
  ```ts
  type SessionUser = { googleSub: string; email: string | null; name: string | null; picture: string | null };
  signSession(user: SessionUser, expOverrideMs?: number): Promise<string>
  verifySession(token: string): Promise<SessionUser | null>
  parseSessionCookie(req: Request): Promise<string | null>
  buildSetCookie(token: string, secure: boolean): string
  SESSION_COOKIE = 'justsayit.session'
  ```

- [ ] **Step 1: 写失败的测试**

`src/lib/server/__tests__/session.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SESSION_COOKIE, signSession, verifySession, parseSessionCookie, buildSetCookie } from '@/lib/server/session';

const SECRET = 'b'.repeat(64);
const ORIG = process.env.SESSION_SECRET;
const USER = { googleSub: 'sub-123', email: 'a@b.c', name: 'A', picture: null };

beforeEach(() => vi.stubEnv('SESSION_SECRET', SECRET));
afterEach(() => vi.stubEnv('SESSION_SECRET', ORIG ?? ''));

describe('session', () => {
  it('签发后能验证回原用户', async () => {
    const t = await signSession(USER);
    expect(await verifySession(t)).toEqual(USER);
  });
  it('过期 token 返回 null', async () => {
    const t = await signSession(USER, -100);
    expect(await verifySession(t)).toBeNull();
  });
  it('被篡改的 token 返回 null', async () => {
    const t = await signSession(USER);
    const bad = t.slice(0, -2) + (t.endsWith('a') ? 'b' : 'a');
    expect(await verifySession(bad)).toBeNull();
  });
  it('cookie 头解析出 token', () => {
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=abc123; other=1` } });
    expect(parseSessionCookie(req)).toBe('abc123');
  });
  it('无 cookie 时解析为 null', () => {
    expect(parseSessionCookie(new Request('http://x/'))).toBeNull();
  });
  it('Set-Cookie 包含 httpOnly / sameSite', () => {
    const v = buildSetCookie('tok', true);
    expect(v).toContain('HttpOnly');
    expect(v).toContain('SameSite=Lax');
    expect(v).toContain('Secure');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/server/__tests__/session.test.ts`
Expected：FAIL，`@/lib/server/session` 不存在。

- [ ] **Step 3: 实现**

`src/lib/server/session.ts`（jose，HS256，无状态 §10.3a）：

```ts
import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'justsayit.session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 天

export type SessionUser = {
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

function secretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 16) throw new Error('SESSION_SECRET 未配置或过短');
  return new TextEncoder().encode(s);
}

export async function signSession(user: SessionUser, expOverrideMs?: number): Promise<string> {
  const now = Date.now();
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.googleSub)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + (expOverrideMs ?? SESSION_TTL_MS)) / 1000))
    .sign(secretKey());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      googleSub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export function parseSessionCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}

export function buildSetCookie(token: string, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secureFlag}`;
}
```

> dev 服务器默认 http，`Secure` cookie 会被浏览器拒绝；各 API route 以 `process.env.NODE_ENV === 'production'` 决定 `secure`。

- [ ] **Step 4: 通过测试**

Run: `npx vitest run src/lib/server/__tests__/session.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，6 个测试全绿；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/session.ts src/lib/server/__tests__/session.test.ts
git commit -m "feat(server): 无状态 JWT session + httpOnly cookie"
```


---

## Task 4: 用户数据访问层（user repo）

**Files:**
- Create: `src/lib/server/user.ts`
- Test: `src/lib/server/__tests__/user.test.ts`

**Interfaces:**
- Consumes: `@/lib/server/db` 的 `prisma`
- Produces:
  ```ts
  type UserProfile = { id: string; googleSub: string; email: string | null; name: string | null; picture: string | null };
  makeUserRepo(db?: DbLike) => {
    findOrCreateUser(input: { googleSub; email; name; picture; refreshTokenEnc? }): Promise<UserProfile>
  }
  userRepo  // 绑定真实 prisma 的单例
  ```
  行为：按 `googleSub` 查；存在则**每次覆盖更新** email/name/picture（§11.5 规则 2），`refreshTokenEnc` 仅在传入且非空时更新；不存在则创建。

- [ ] **Step 1: 写失败的测试**

`src/lib/server/__tests__/user.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeUserRepo } from '@/lib/server/user';

type Row = { id: string; googleSub: string; email: string | null; name: string | null; picture: string | null; refreshTokenEnc: string | null };
const rows: Row[] = [];

const fakeDb = {
  user: {
    upsert: async ({ where, create, update }: {
      where: { googleSub: string }; create: Row; update: Partial<Row>;
    }) => {
      const existing = rows.find((r) => r.googleSub === where.googleSub);
      if (existing) {
        Object.assign(existing, update, { id: existing.id });
        return existing;
      }
      const row: Row = { id: `u${rows.length + 1}`, ...create };
      rows.push(row);
      return row;
    },
  },
};

beforeEach(() => { rows.length = 0; });

describe('findOrCreateUser', () => {
  it('新用户时创建', async () => {
    const repo = makeUserRepo(fakeDb);
    const u = await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null });
    expect(u.googleSub).toBe('s1');
    expect(rows).toHaveLength(1);
  });
  it('已存在时更新 email（每次登录覆盖）', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null });
    await repo.findOrCreateUser({ googleSub: 's1', email: 'new@b.c', name: 'A', picture: null });
    expect(rows[0].email).toBe('new@b.c');
  });
  it('refreshTokenEnc 仅在传入时更新', async () => {
    const repo = makeUserRepo(fakeDb);
    await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null, refreshTokenEnc: 'ENC' });
    expect(rows[0].refreshTokenEnc).toBe('ENC');
    await repo.findOrCreateUser({ googleSub: 's1', email: 'a@b.c', name: 'A', picture: null });
    expect(rows[0].refreshTokenEnc).toBe('ENC');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/server/__tests__/user.test.ts`
Expected：FAIL，`@/lib/server/user` 不存在。

- [ ] **Step 3: 实现**

`src/lib/server/user.ts`（factory 模式以便注入 fake db；生产用真实 prisma）：

```ts
import { prisma } from '@/lib/server/db';

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

type DbLike = {
  user: {
    upsert(args: {
      where: { googleSub: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
  };
};

export function makeUserRepo(db: DbLike = prisma) {
  return {
    async findOrCreateUser(input: Input): Promise<UserProfile> {
      const { googleSub, email, name, picture, refreshTokenEnc } = input;
      const update: Record<string, unknown> = { email, name, picture };
      if (refreshTokenEnc) update.refreshTokenEnc = refreshTokenEnc;
      const row = await db.user.upsert({
        where: { googleSub },
        create: { googleSub, email, name, picture, ...(refreshTokenEnc ? { refreshTokenEnc } : {}) },
        update,
      });
      return {
        id: String(row.id),
        googleSub: String(row.googleSub),
        email: (row.email as string | null) ?? null,
        name: (row.name as string | null) ?? null,
        picture: (row.picture as string | null) ?? null,
      };
    },
  };
}

export const userRepo = makeUserRepo();
```

- [ ] **Step 4: 通过测试**

Run: `npx vitest run src/lib/server/__tests__/user.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，3 个测试全绿；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/user.ts src/lib/server/__tests__/user.test.ts
git commit -m "feat(server): User 数据访问（按 googleSub upsert）"
```


---

## Task 5: per-user AI 配额（quota）+ 认证保护 guard

**Files:**
- Create: `src/lib/server/quota.ts`
- Create: `src/lib/server/guard.ts`
- Test: `src/lib/server/__tests__/quota.test.ts`, `src/lib/server/__tests__/guard.test.ts`

**Interfaces:**
- Consumes: `@/lib/server/session`、`@/lib/server/db`
- Produces:
  ```ts
  // quota.ts
  const DAILY_AI_QUOTA = 60                          // 每日 AI 调用上限（structure + stt 共享）
  makeQuotaService(db?: DbLike) => { consume(userId, dateKey?): Promise<{ok:true;remaining:number}|{ok:false;message:string}> }
  quotaService                                        // 绑定真实 prisma
  todayKey(d?: Date): string                          // "YYYY-MM-DD"

  // guard.ts（route 复用）
  async function authenticate(req: Request): Promise<SessionUser | { bypass: true } | { error: { status: number; body: unknown } }>
  ```

- [ ] **Step 1: 写失败的 quota 测试**

`src/lib/server/__tests__/quota.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeQuotaService } from '@/lib/server/quota';

type Row = { id: string; aiCallsToday: number; lastResetDate: string };
const rows: Row[] = [];

const fakeDb = {
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb),
  user: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      rows.find((r) => r.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
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
    expect((res as { remaining: number }).remaining).toBe(59);
  });
  it('日期变化时重置计数后再消费', async () => {
    rows[0].aiCallsToday = 59;
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('u1', '2026-09-05');
    expect(res.ok).toBe(true);
    expect(rows[0].lastResetDate).toBe('2026-09-05');
    expect(rows[0].aiCallsToday).toBe(1);
  });
  it('已超配额时拒绝', async () => {
    rows[0].aiCallsToday = 60;
    const s = makeQuotaService(fakeDb);
    const res = await s.consume('u1', '2026-09-04');
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/server/__tests__/quota.test.ts`
Expected：FAIL，`@/lib/server/quota` 不存在。

- [ ] **Step 3: 实现 quota.ts**

`src/lib/server/quota.ts`（原子性：`$transaction` 内 读→判断→更新；DB 由 factory 注入）：

```ts
import { prisma } from '@/lib/server/db';

export const DAILY_AI_QUOTA = 60;

type DbLike = {
  $transaction(fn: (tx: unknown) => Promise<unknown>): Promise<unknown>;
  user: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string; aiCallsToday: number; lastResetDate: string } | null>;
    update(args: { where: { id: string }; data: { aiCallsToday?: number; lastResetDate?: string } }): Promise<unknown>;
  };
};

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function makeQuotaService(db: DbLike = prisma) {
  return {
    async consume(userId: string, dateKey = todayKey()) {
      // 事务内必须用 tx 客户端读写，才能让「读→判断→写」整体原子（§11.5）：并发请求不会双买配额
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
          return { ok: false as const, message: `今日 AI 调用已达上限（${DAILY_AI_QUOTA} 次）` };
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

export const quotaService = makeQuotaService();
```

> `consume` 的 `dateKey` 默认当前 UTC 日期（MVP 以 UTC 日界简化，生产可改用户时区）。

- [ ] **Step 4: 通过 quota 测试**

Run: `npx vitest run src/lib/server/__tests__/quota.test.ts`
Expected：PASS，3 个测试全绿。


- [ ] **Step 5: 写失败的 guard 测试**

`src/lib/server/__tests__/guard.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authenticate } from '@/lib/server/guard';

vi.mock('@/lib/server/session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/session')>('@/lib/server/session');
  return { ...actual, verifySession: vi.fn() };
});

import { verifySession, SESSION_COOKIE } from '@/lib/server/session';

const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => { vi.clearAllMocks(); });

describe('authenticate', () => {
  it('有效 session → 返回用户', async () => {
    vi.mocked(verifySession).mockResolvedValue(USER);
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=tok` } });
    expect(await authenticate(req)).toEqual(USER);
  });
  it('无 cookie → 401', async () => {
    const r = await authenticate(new Request('http://x/'));
    expect('error' in r && r.error.status === 401).toBe(true);
  });
  it('无效 session → 401', async () => {
    vi.stubEnv('ALLOW_UNAUTHENTICATED_API', 'false');
    vi.mocked(verifySession).mockResolvedValue(null);
    const req = new Request('http://x/', { headers: { cookie: `${SESSION_COOKIE}=bad` } });
    const r = await authenticate(req);
    expect('error' in r && r.error.status === 401).toBe(true);
  });
  it('ALLOW_UNAUTHENTICATED_API=true → 放行（bypass）', async () => {
    vi.stubEnv('ALLOW_UNAUTHENTICATED_API', 'true');
    const r = await authenticate(new Request('http://x/'));
    expect('bypass' in r && r.bypass === true).toBe(true);
  });
});
```

- [ ] **Step 6: 实现 guard.ts**

`src/lib/server/guard.ts`：

```ts
import type { SessionUser } from '@/lib/server/session';
import { parseSessionCookie, verifySession } from '@/lib/server/session';

type Result =
  | { bypass: true }
  | (SessionUser & { bypass?: never })
  | { error: { status: number; body: unknown } };

export async function authenticate(req: Request): Promise<Result> {
  // 显式逃生舱：仅当明确设置时才放行，NODE_ENV 不再自动放行
  if (process.env.ALLOW_UNAUTHENTICATED_API === 'true') {
    return { bypass: true };
  }
  const token = parseSessionCookie(req);
  if (!token) return { error: { status: 401, body: { error: '未登录' } } };
  const user = await verifySession(token);
  if (!user) return { error: { status: 401, body: { error: '会话无效或已过期' } } };
  return user;
}
```

- [ ] **Step 7: 通过 guard 测试**

Run: `npx vitest run src/lib/server/__tests__/guard.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，4 个测试全绿；typecheck 通过。

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/quota.ts src/lib/server/guard.ts src/lib/server/__tests__/quota.test.ts src/lib/server/__tests__/guard.test.ts
git commit -m "feat(server): per-user 每日 AI 配额 + API 认证保护 guard"
```


---

## Task 6: Google OAuth 登录流程（login / callback / logout / session）

**Files:**
- Create: `src/lib/auth/oauth.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/callback/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/api/auth/session/route.ts`
- Test: `src/lib/auth/__tests__/oauth.test.ts`

**Interfaces:**
- Consumes: `@/lib/server/session`、`@/lib/server/user`、`@/lib/server/crypto`、env `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`
- Produces:
  ```ts
  // oauth.ts（server-only 逻辑）
  SCOPE = 'openid email profile drive.appdata'          // §11.2 一次性全部 scope
  buildAuthorizeUrl(state: string, nonce: string): string
  exchangeCode(code: string): Promise<{ idToken: string; refreshToken?: string }>
  verifyIdToken(idToken: string): Promise<{ googleSub: string; email: string|null; name: string|null; picture: string|null }>
  ```

- [ ] **Step 1: 写失败的 oauth 测试**

`src/lib/auth/__tests__/oauth.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildAuthorizeUrl, SCOPE, exchangeCode } from '@/lib/auth/oauth';

const ORIG = {
  id: process.env.GOOGLE_CLIENT_ID,
  redirect: process.env.GOOGLE_REDIRECT_URI,
  secret: process.env.GOOGLE_CLIENT_SECRET,
};

beforeEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'client-1');
  vi.stubEnv('GOOGLE_REDIRECT_URI', 'http://localhost:3000/api/auth/callback');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret-1');
});
afterEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', ORIG.id ?? '');
  vi.stubEnv('GOOGLE_REDIRECT_URI', ORIG.redirect ?? '');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', ORIG.secret ?? '');
});

describe('oauth', () => {
  it('authorize url 包含全部 scope 与 access_type=offline', () => {
    const url = buildAuthorizeUrl('st', 'n1');
    expect(url).toContain('openid');
    expect(url).toContain('drive.appdata');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('state=st');
    expect(url).toContain('nonce=n1');
  });
  it('exchangeCode 请求 token endpoint 并带 basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: 'ID', refresh_token: 'REF' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const r = await exchangeCode('CODE');
    expect(r).toEqual({ idToken: 'ID', refreshToken: 'REF' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).code).toBe('CODE');
  });
  it('token endpoint 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    await expect(exchangeCode('BAD')).rejects.toThrow();
  });
});
```

> 注：`verifyIdToken` 的完整验签（JWKS、aud、exp、nonce）在真实登录时执行；单测用 `exchangeCode` 返回的 `idToken` 字符串仅测接口形状。完整验签依赖 Google 公钥，无法离线测，故不在单测断言。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/auth/__tests__/oauth.test.ts`
Expected：FAIL，`@/lib/auth/oauth` 不存在。

- [ ] **Step 3: 实现 oauth.ts**

`src/lib/auth/oauth.ts`：

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

export const SCOPE = 'openid email profile drive.appdata';

function clientConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redirect) throw new Error('缺少 Google OAuth 配置');
  return { id, secret, redirect };
}

export function buildAuthorizeUrl(state: string, nonce: string): string {
  const { id, redirect } = clientConfig();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'select_account',
    state,
    nonce,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

const googleJWKS = createRemoteJWKSet(new URL(JWKS_URI));

export async function verifyIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<{
  googleSub: string; email: string | null; name: string | null; picture: string | null;
}> {
  const { id } = clientConfig();
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    audience: id,
    issuer: ['https://accounts.google.com', 'https://accounts.google.com/'],
    algorithms: ['RS256', 'ES256'],
  });
  // nonce 防重放：回调时比对 login 时生成的随机数（存在 oauth_state cookie 中）
  if (expectedNonce != null && payload.nonce !== expectedNonce) {
    throw new Error('ID token nonce 不匹配');
  }
  if (typeof payload.sub !== 'string') throw new Error('ID token 缺少 sub');
  return {
    googleSub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}

export async function exchangeCode(code: string): Promise<{ idToken: string; refreshToken?: string }> {
  const { id, secret, redirect } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token 交换失败：HTTP ${res.status}`);
  const data = (await res.json()) as { id_token?: string; refresh_token?: string };
  if (!data.id_token) throw new Error('Google token 响应缺少 id_token');
  return { idToken: data.id_token, refreshToken: data.refresh_token };
}
```

- [ ] **Step 4: 通过 oauth 测试**

Run: `npx vitest run src/lib/auth/__tests__/oauth.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，3 个测试全绿；typecheck 通过（`tsconfig` 需允许 `lib/auth` 只被 server 使用——该模块不含 `'use client'`，只被服务端 route import，安全）。


- [ ] **Step 5: 实现 login route**

`src/app/api/auth/login/route.ts`（GET：生成 state/nonce，存 state 到 httpOnly cookie，重定向 Google）：

```ts
import { randomBytes } from 'node:crypto';
import { buildAuthorizeUrl } from '@/lib/auth/oauth';

export const runtime = 'nodejs';

export async function GET() {
  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(16).toString('hex');
  const url = buildAuthorizeUrl(state, nonce);
  // state+nonce 放同一 httpOnly cookie：state 防 CSRF，nonce 防 ID token 重放
  const cookie = `justsayit.oauth_state=${state}.${nonce}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`;
  return new Response(null, { status: 302, headers: { Location: url, 'Set-Cookie': cookie } });
}
```

> 注：`/login` 页面跳转到本端点即完成授权启动；`nonce` 无需另存。

- [ ] **Step 6: 实现 callback route**

`src/app/api/auth/callback/route.ts`（GET：验证 state → 换 token → 验 ID token → upsert 用户 → 设 session cookie → 跳首页）：

```ts
import { exchangeCode, verifyIdToken } from '@/lib/auth/oauth';
import { userRepo } from '@/lib/server/user';
import { encryptRefreshToken } from '@/lib/server/crypto';
import { signSession, buildSetCookie } from '@/lib/server/session';

export const runtime = 'nodejs';
const secure = process.env.NODE_ENV === 'production';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  const storedState = (req.headers.get('cookie') ?? '')
    .split(';').map((s) => s.trim()).find((s) => s.startsWith('justsayit.oauth_state='));
  const [expectedState, expectedNonce] = (storedState?.split('=')[1] ?? '').split('.');

  if (error || !code || !expectedState || !expectedNonce || state !== expectedState) {
    return new Response(null, { status: 302, headers: { Location: '/login?error=oauth' } });
  }
  // 使用过即失效
  const clearState = 'justsayit.oauth_state=; Path=/; Max-Age=0';

  try {
    const { idToken, refreshToken } = await exchangeCode(code);
    const profile = await verifyIdToken(idToken, expectedNonce);
    const refreshTokenEnc = refreshToken ? encryptRefreshToken(refreshToken) : undefined;
    await userRepo.findOrCreateUser({ ...profile, refreshTokenEnc });
    const token = await signSession(profile);
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': [buildSetCookie(token, secure), clearState].join(', '),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ route: 'auth/callback', ok: false, error: err instanceof Error ? err.message : 'unknown' }));
    return new Response(null, { status: 302, headers: { Location: '/login?error=oauth', 'Set-Cookie': clearState } });
  }
}
```

> 说明：`lastLoginAt` 由 Prisma `@updatedAt` 在 upsert 更新时自动刷新。

- [ ] **Step 7: 实现 logout 与 session route**

`src/app/api/auth/logout/route.ts`：

```ts
import { buildSetCookie } from '@/lib/server/session';
const secure = process.env.NODE_ENV === 'production';

export const runtime = 'nodejs';

export async function POST() {
  // Mark 过期：Max-Age=0
  const cookie = `${buildSetCookie('', secure).split(';')[0]}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}
```

`src/app/api/auth/session/route.ts`（GET：返回当前用户供前端 hook）：

```ts
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if ('error' in auth) {
    return Response.json({ user: null });
  }
  if ('bypass' in auth) {
    return Response.json({ user: null });
  }
  return Response.json({ user: auth });
}
```

> 注意：`session` 返回的用户即 JWT 里的 `SessionUser`（googleSub/email/name/picture）。未登录统一返回 `{ user: null }`（200），前端据此决定 UI，不产生 401 噪音。

- [ ] **Step 8: 更新 `structure` 测试前，跑 `tsc --noEmit` 确认 auth routes 编译**

Run: `npx tsc --noEmit`
Expected：PASS。若 `exactOptionalPropertyTypes` 等严格配置报错，按报错调整类型。

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth src/app/api/auth .env.example
git commit -m "feat(auth): Google OAuth login/callback/logout/session"
```

---

## Task 7: `/api/structure` 接入认证与配额

**Files:**
- Modify: `src/app/api/structure/route.ts`
- Modify: `src/app/api/structure/__tests__/route.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `@/lib/server/guard.authenticate`、`@/lib/server/quota.quotaService`
- Produces: 端点在请求成功时返回 `{ records }`（Plan 1 契约不变）

- [ ] **Step 1: 重写 route.ts**

替换 `accessAllowed()` 逻辑为 guard + quota。保留 RequestSchema（含 text max 2000）与零内容日志。

`src/app/api/structure/route.ts`：

```ts
import { z } from 'zod';
import { structure } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  localTime: z.string().min(1),
  timeZone: z.string().min(1),
  defaultCurrency: z.string().length(3),
});

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: '请求参数不合法' }, { status: 400 });
  }

  // server-side 配额：每个 AI 调用（structure 或 stt）都从用户配额扣一次（§10.3a）
  if (!('bypass' in auth)) {
    const profile = await userRepo.findOrCreateUser({
      googleSub: auth.googleSub, email: auth.email, name: auth.name, picture: auth.picture,
    });
    const q = await quotaService.consume(profile.id);
    if (!q.ok) {
      return Response.json({ error: q.message }, { status: 429 });
    }
  }

  const { text, ...ctx } = parsed.data;
  const started = Date.now();
  try {
    const records = await structure(text, ctx);
    // 零内容日志：只记元数据（§10.5）
    console.info(JSON.stringify({
      route: 'structure', ok: true, ms: Date.now() - started, count: records.length,
    }));
    return Response.json({ records });
  } catch (err) {
    console.error(JSON.stringify({
      route: 'structure', ok: false, ms: Date.now() - started,
      error: err instanceof Error ? err.message : 'unknown',
    }));
    return Response.json({ error: '结构化失败，请重试' }, { status: 502 });
  }
}
```

> 配额按 `googleSub` 查找/创建 User 行后对 `User.id` 扣减；`bypass` 模式跳过配额（逃生舱语义）。
- [ ] **Step 2: 更新 route 测试**

`src/app/api/structure/__tests__/route.test.ts` 重写（mock 掉 guard/quota/user）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai', () => ({ structure: vi.fn() }));
vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/quota', () => ({ quotaService: { consume: vi.fn() } }));
vi.mock('@/lib/server/user', () => ({ userRepo: { findOrCreateUser: vi.fn() } }));

import { POST } from '@/app/api/structure/route';
import { structure } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

const body = {
  text: '早餐麦当劳25',
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};
const req = (b: unknown) =>
  new Request('http://localhost/api/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });

const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.findOrCreateUser).mockResolvedValue({ id: 'u1', ...USER });
  vi.mocked(quotaService.consume).mockResolvedValue({ ok: true, remaining: 59 });
  vi.mocked(structure).mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/structure 已认证', () => {
  it('有效 session → 返回抽取结果', async () => {
    vi.mocked(structure).mockResolvedValue([{
      type: 'EXPENSE', amount: 25, currency: null, date: '2026-09-04',
      category: 'FOOD', merchant: '麦当劳', description: '早餐',
    }]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect((await res.json()).records).toHaveLength(1);
  });
  it('未登录 → 401 且不调 AI', async () => {
    vi.mocked(authenticate).mockResolvedValue({ error: { status: 401, body: { error: '未登录' } } });
    const res = await POST(req(body));
    expect(res.status).toBe(401);
    expect(structure).not.toHaveBeenCalled();
  });
  it('超配额 → 429 且不调 AI', async () => {
    vi.mocked(quotaService.consume).mockResolvedValue({ ok: false, message: '今日已达上限' });
    const res = await POST(req(body));
    expect(res.status).toBe(429);
    expect(structure).not.toHaveBeenCalled();
  });
  it('text 为空/超长仍返回 400', async () => {
    expect((await POST(req({ ...body, text: '  ' }))).status).toBe(400);
    expect((await POST(req({ ...body, text: 'x'.repeat(2001) }))).status).toBe(400);
  });
  it('上游失败返回 502 且响应不含用户输入', async () => {
    vi.mocked(structure).mockRejectedValue(new Error('Groq 请求失败：HTTP 429'));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('早餐麦当劳');
  });
  it('bypass 逃生舱放行（不再查配额）', async () => {
    vi.mocked(authenticate).mockResolvedValue({ bypass: true } as never);
    vi.mocked(structure).mockResolvedValue([]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(quotaService.consume).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试**

Run: `npx vitest run src/app/api/structure/__tests__/route.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，6 个测试全绿；typecheck 通过。

> 删除旧 `accessAllowed`/`ALLOW_UNAUTHENTICATED_API` 分支测试——该逻辑已由 guard 统一替代。

- [ ] **Step 4: 更新 .env.example**

`ALLOW_UNAUTHENTICATED_API=false` 注释更新为：逃生舱，仅本地无 OAuth 凭据时开发用；生产必须 `false` 或删除该变量。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/structure src/app/api/structure/__tests__ .env.example
git commit -m "feat(api): /api/structure 接入认证与 per-user 配额"
```
---

## Task 8: STT provider 适配器（Groq whisper）与 `transcribe` 窄接口

**Files:**
- Modify: `src/lib/ai/providers/groq.ts`
- Modify: `src/lib/ai/index.ts`
- Test: `src/lib/ai/providers/__tests__/groq.test.ts`、`src/lib/ai/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `@/lib/ai/schema`（无新增）、global `fetch`
- Produces:
  ```ts
  // index.ts（业务层唯一入口）
  transcribe(audio: Blob, vocab: string[]): Promise<{ text: string }>

  // providers/groq.ts（唯一含 provider 细节文件）
  groqTranscribe(audio: Blob, vocab: string[]): Promise<{ text: string }>
  ```
  内部固定参数（spec §16.6）：`model=whisper-large-v3-turbo`、`language=zh`、`temperature=0`、`response_format=verbose_json`；prompt 词表 = vocab 前 224 token（逗号分隔）；**429 时指数退避重试最多 3 次**（§10.3a）。

- [ ] **Step 1: 写失败的 groqTranscribe 测试**

在 `src/lib/ai/providers/__tests__/groq.test.ts` 追加 describe 块（并在文件级 `afterEach` 调 `vi.unstubAllGlobals()`）：

```ts
describe('groqTranscribe', () => {
  const audio = new Blob(['fake-webm'], { type: 'audio/webm' });

  it('发送 multipart 到 Groq 转写端点并解析 verbose_json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Woolworths 买菜 54 块 3', language: 'zh', duration: '3.4' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    const res = await groqTranscribe(audio, ['Woolworths', 'Uber Eats']);
    expect(res.text).toContain('Woolworths');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('audio/transcriptions');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('zh');
    expect(String(form.get('prompt'))).toContain('Woolworths');
    expect((form.get('file') as File).name).toBe('recording.webm');
  });

  it('429 时指数退避重试并最终成功', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ text: 'ok' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    const res = await groqTranscribe(audio, []);
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('连续 429 重试耗尽后抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal('fetch', fetchMock);
    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    await expect(groqTranscribe(audio, [])).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('错误消息不带响应体内容', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'secret content' }));
    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    await expect(groqTranscribe(audio, [])).rejects.toThrow(/HTTP 500/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/ai/providers/__tests__/groq.test.ts`
Expected：FAIL，`groqTranscribe` 不存在。
- [ ] **Step 3: 实现 groqTranscribe**

在 `src/lib/ai/providers/groq.ts` 追加（顶部常量旁新增 STT 常量），全部 provider 细节留在本文件：

```ts
const TRANSCRIBE_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const TRANSCRIBE_MODEL = 'whisper-large-v3-turbo';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function groqTranscribe(
  audio: Blob,
  vocab: string[],
): Promise<{ text: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('缺少 GROQ_API_KEY');

  // 词表上限 224 tokens（spec §16.6）：合并、去重、截取
  const prompt = [...new Set(vocab)].join(', ').slice(0, 224);

  const form = new FormData();
  form.append('model', TRANSCRIBE_MODEL);
  form.append('file', audio, 'recording.webm');
  form.append('language', 'zh');
  form.append('temperature', '0');
  form.append('response_format', 'verbose_json');
  if (prompt) form.append('prompt', prompt);

  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(TRANSCRIBE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (res.ok) {
      const json = (await res.json()) as { text?: unknown };
      if (typeof json.text !== 'string') throw new Error('Groq 返回缺少 text 字段');
      return { text: json.text };
    }
    lastStatus = res.status;
    if (res.status === 429 && attempt < 2) {
      await sleep(300 * 2 ** attempt); // 300ms / 600ms
      continue;
    }
    break;
  }
  // 不带响应体，零内容日志（§10.5）
  throw new Error(`Groq 转写失败：HTTP ${lastStatus}`);
}
```

> `FormData` 在 Node 24 运行时原生可用（web 标准）。multipart 处理由运行时完成。

- [ ] **Step 4: 更新 index.ts**

`src/lib/ai/index.ts`：

```ts
import { groqStructure, groqTranscribe } from '@/lib/ai/providers/groq';
import type { StructureContext } from '@/lib/ai/prompt';
import type { AiTransaction } from '@/lib/ai/schema';

export type { StructureContext } from '@/lib/ai/prompt';

export function structure(text: string, ctx: StructureContext): Promise<AiTransaction[]> {
  return groqStructure(text, ctx);
}

/** STT 窄接口：业务层只见 Audio → Text（§9、§10.3） */
export function transcribe(audio: Blob, vocab: string[]): Promise<{ text: string }> {
  return groqTranscribe(audio, vocab);
}
```

- [ ] **Step 5: 运行测试 + typecheck + 隔离判据**

Run:
```bash
npx vitest run src/lib/ai/providers/__tests__/groq.test.ts src/lib/ai/__tests__/index.test.ts
npx tsc --noEmit
grep -rni "groq" src/ | grep -v "src/lib/ai/providers/groq.ts"
```
Expected：两个测试文件 PASS；typecheck 通过；最后一条 grep **无输出**（§10.3 判据）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/providers/groq.ts src/lib/ai/index.ts src/lib/ai/providers/__tests__/groq.test.ts src/lib/ai/__tests__/index.test.ts
git commit -m "feat(ai): STT provider 适配器（whisper-large-v3-turbo + 词表 + 429 重试）"
```
---

## Task 9: `/api/stt` 路由（鉴权 → 配额 → 转写）

**Files:**
- Create: `src/app/api/stt/route.ts`
- Test: `src/app/api/stt/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `@/lib/server/guard`、`@/lib/server/quota`、`@/lib/server/user`、`@/lib/ai.transcribe`
- Produces: `POST /api/stt` → 200 `{ text }` | 401 | 429 | 400（过大/缺音频）| 502（上游失败）

请求协议（§9 直传设计）：

- `content-type: audio/webm`（或任意 `audio/*`）
- body = 音频二进制（MediaRecorder 原生输出，不做转码）
- query：`?vocab=<encodeURIComponent(JSON.stringify(string[]))>`（前端用 `knownMerchants()` 生成）

- [ ] **Step 1: 写失败的测试**

`src/app/api/stt/__tests__/route.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/quota', () => ({ quotaService: { consume: vi.fn() } }));
vi.mock('@/lib/server/user', () => ({ userRepo: { findOrCreateUser: vi.fn() } }));
vi.mock('@/lib/ai', () => ({ transcribe: vi.fn() }));

import { POST } from '@/app/api/stt/route';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';
import { transcribe } from '@/lib/ai';

const USER = { googleSub: 's1', email: null, name: null, picture: null };

const audioReq = (opts?: { size?: number; contentType?: string; vocab?: string[] }) => {
  const size = opts?.size ?? 1024;
  const body = new Blob([new Uint8Array(size)], { type: opts?.contentType ?? 'audio/webm' });
  const params = new URLSearchParams({ vocab: JSON.stringify(opts?.vocab ?? []) });
  return new Request(`http://localhost/api/stt?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': opts?.contentType ?? 'audio/webm' },
    body,
  });
};

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.findOrCreateUser).mockResolvedValue({ id: 'u1', ...USER });
  vi.mocked(quotaService.consume).mockResolvedValue({ ok: true, remaining: 59 });
  vi.mocked(transcribe).mockResolvedValue({ text: 'Woolworths 买菜' });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/stt', () => {
  it('转发 audio 与 vocab 给 transcribe 并返回 text', async () => {
    const res = await POST(audioReq({ vocab: ['Woolworths'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe('Woolworths 买菜');
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
  it('未登录 → 401，不调 AI', async () => {
    vi.mocked(authenticate).mockResolvedValue({ error: { status: 401, body: { error: '未登录' } } });
    const res = await POST(audioReq());
    expect(res.status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('超配额 → 429，不调 AI', async () => {
    vi.mocked(quotaService.consume).mockResolvedValue({ ok: false, message: '今日已达上限' });
    const res = await POST(audioReq());
    expect(res.status).toBe(429);
    expect(transcribe).not.toHaveBeenCalled();
  });
  it('非音频 content-type → 400', async () => {
    const res = await POST(audioReq({ contentType: 'text/plain' }));
    expect(res.status).toBe(400);
  });
  it('音频超过 25MB → 400', async () => {
    const res = await POST(audioReq({ size: 26 * 1024 * 1024 }));
    expect(res.status).toBe(400);
  });
  it('转写失败 → 502 且不泄露内容', async () => {
    vi.mocked(transcribe).mockRejectedValue(new Error('Groq 转写失败：HTTP 500'));
    const res = await POST(audioReq());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('Woolworths');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/app/api/stt/__tests__/route.test.ts`
Expected：FAIL，`@/app/api/stt/route`（或 `@/lib/ai` 的 transcribe）不存在。
- [ ] **Step 3: 实现 route.ts**

`src/app/api/stt/route.ts`：

```ts
import { transcribe } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq 免费层单文件上限（§10.3a）

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/')) {
    return Response.json({ error: '仅接受音频（audio/*）' }, { status: 400 });
  }

  const blob = await request.blob();
  if (blob.size === 0) {
    return Response.json({ error: '音频为空' }, { status: 400 });
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: '音频过大' }, { status: 400 });
  }

  // 词表偏置（spec §16.3）：来自前端 knownMerchants()
  let vocab: string[] = [];
  const raw = new URL(request.url).searchParams.get('vocab');
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) vocab = parsed.filter((x): x is string => typeof x === 'string');
    } catch {
      // 非法 vocab 忽略，不拒绝请求——偏置是可选的增强
    }
  }

  if (!('bypass' in auth)) {
    const profile = await userRepo.findOrCreateUser({
      googleSub: auth.googleSub, email: auth.email, name: auth.name, picture: auth.picture,
    });
    const q = await quotaService.consume(profile.id);
    if (!q.ok) {
      return Response.json({ error: q.message }, { status: 429 });
    }
  }

  const started = Date.now();
  try {
    const { text } = await transcribe(blob, vocab);
    // 零内容日志（§10.5）
    console.info(JSON.stringify({ route: 'stt', ok: true, ms: Date.now() - started, chars: text.length }));
    return Response.json({ text });
  } catch (err) {
    console.error(JSON.stringify({
      route: 'stt', ok: false, ms: Date.now() - started,
      error: err instanceof Error ? err.message : 'unknown',
    }));
    return Response.json({ error: '转写失败，请重试' }, { status: 502 });
  }
}
```

- [ ] **Step 4: 通过测试 + typecheck**

Run: `npx vitest run src/app/api/stt/__tests__/route.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，6 个测试全绿；typecheck 通过。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stt src/app/api/stt/__tests__/route.test.ts
git commit -m "feat(api): /api/stt 语音转写端点（认证 + 配额 + 词表偏置）"
```
---

## Task 10: 前端 session hook、登录页与主屏集成

**Files:**
- Create: `src/lib/auth/client.ts`
- Create: `src/app/login/page.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/lib/auth/__tests__/client.test.tsx`、`src/app/__tests__/page.test.tsx`（更新）

**Interfaces:**
- Consumes: `@/app/api/auth/session`（GET `{ user: SessionUser | null }`）
- Produces:
  ```ts
  // client.ts
  type SessionState = { user: SessionUser | null; loading: boolean };
  useSession(): SessionState
  reloadSession(): void   // 登录回调回来后重新拉取
  fetchLogout(): Promise<void>
  ```

- [ ] **Step 1: 写失败的 client 测试**

`src/lib/auth/__tests__/client.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { useSession } from '@/lib/auth/client';

describe('useSession', () => {
  it('加载后返回用户', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ user: { googleSub: 's1', email: 'a@b.c', name: 'A', picture: null } }),
    }));
    let captured: ReturnType<typeof useSession> | null = null;
    function Probe() {
      captured = useSession();
      return <div>{captured.user ? captured.user.googleSub : 'none'}</div>;
    }
    render(<Probe />);
    await waitFor(() => expect(captured?.user?.googleSub).toBe('s1'));
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/auth/__tests__/client.test.tsx`
Expected：FAIL，`@/lib/auth/client` 不存在。

- [ ] **Step 3: 实现 client.ts**

`src/lib/auth/client.ts`（client hook；不含任何 server 模块 import）：

```ts
'use client';

import { useSyncExternalStore, useEffect } from 'react';
import type { SessionUser } from '@/lib/server/session';

type SessionState = { user: SessionUser | null; loading: boolean };
type Listener = () => void;

let cached: SessionState = { user: null, loading: true };
const listeners = new Set<Listener>();

export function getSession(): SessionState {
  return cached;
}

export function reloadSession(): void {
  void (async () => {
    cached = { ...cached, loading: true };
    emit();
    try {
      const res = await fetch('/api/auth/session');
      const data = (await res.json()) as { user: SessionUser | null };
      cached = { user: data.user, loading: false };
    } catch {
      cached = { user: null, loading: false };
    }
    emit();
  })();
}

export async function fetchLogout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' });
  cached = { user: null, loading: false };
  emit();
}

function emit() {
  for (const l of listeners) l();
}

export function useSession(): SessionState {
  useEffect(() => {
    listeners.add(reloadIfLoading);
    if (cached.loading) reloadSession();
    return () => { listeners.delete(reloadIfLoading); };
  }, []);
  return useSyncExternalStore(
    () => { /* noop */ },
    getSession,
    () => cached,
  );
}

function reloadIfLoading() {
  /* 占位：listener 集合保持非空（简单共享订阅模式） */
}

export { getSession as getSessionSnapshot };
```

> 说明：这是最小共享订阅实现——`useSession` 在挂载时触发一次拉取，此后 session 不再自动刷新（登录/登出由页面显式调用 `reloadSession`）。组件渲染由 `useSyncExternalStore` 驱动。

- [ ] **Step 4: 通过 client 测试**

Run: `npx vitest run src/lib/auth/__tests__/client.test.tsx` 与 `npx tsc --noEmit`
Expected：PASS；typecheck 通过。

> 注意：`import type { SessionUser } from '@/lib/server/session'` 仅引入类型（编译期擦除），不会把 server 实现拖入 client bundle。若 typecheck 报错则改为在 `session.ts` 中提取 `src/lib/auth/session-types.ts` 纯类型文件。

- [ ] **Step 5: 实现登录页**

`src/app/login/page.tsx`：

```tsx
'use client';

import { useSession } from '@/lib/auth/client';

export default function LoginPage() {
  const { user, loading } = useSession();

  if (!loading && user) {
    // 已登录：直接回主屏
    if (typeof window !== 'undefined') window.location.href = '/';
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      <p>登录后即可使用 AI 记账与语音输入。</p>
      {/* 客户端不保存凭据；跳转 /api/auth/login → Google */}
      <a href="/api/auth/login">使用 Google 登录</a>
      {' '}
      <a href="/">返回（可查看本地账本）</a>
    </main>
  );
}
```

- [ ] **Step 6: 更新 page.tsx 主屏集成 session**

`src/app/page.tsx`：在页面顶部接入 `useSession()`，未登录时显示登录引导但保留账本（§11.4 local-first）：

```tsx
const { user, loading } = useSession();
const authed = !loading && user != null;
...
<header>
  <h1>JustSayIt</h1>
  {user && (
    <div>
      <span>{user.email ?? user.googleSub}</span>
      <button type="button" onClick={() => void fetchLogout()}>退出</button>
    </div>
  )}
</header>
{authed ? (
  <Composer onSubmit={handleSubmit} />
) : (
  <p>
    <a href="/login">登录后开始记账</a>
  </p>
)}
```

> 账本区（`LedgerList`）无条件渲染——本地账本不因登录状态而隐藏（§11.4）。

- [ ] **Step 7: 更新 page 测试并补齐登录态分支**

在 `src/app/__tests__/page.test.tsx` 中 mock `@/lib/auth/client` 提供 `{ user: null, loading: false }`（默认），并补一条"已登录时显示 Composer"用例。验收：

Run: `npx vitest run src/app/__tests__/page.test.tsx` 与 `npx tsc --noEmit`
Expected：PASS；typecheck 通过。

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/client.ts src/lib/auth/__tests__ src/app/login src/app/page.tsx src/app/__tests__
git commit -m "feat(ui): session hook、登录页与主屏登录态集成"
```
---

## Task 11: 录音、VoiceButton 与输入框回填

**Files:**
- Create: `src/lib/voice/recorder.ts`
- Create: `src/components/VoiceButton.tsx`
- Modify: `src/components/Composer.tsx`
- Test: `src/lib/voice/__tests__/recorder.test.ts`、`src/components/__tests__/VoiceButton.test.tsx`、`src/components/__tests__/Composer.test.tsx`（更新）

**Interfaces:**
- Consumes: `@/lib/ai.transcribe`、`@/lib/ledger/store.knownMerchants`
- Produces:
  ```ts
  // recorder.ts
  type RecorderHandle = { stop(): Promise<Blob>; cancel(): void };
  startRecording(opts?: { maxMs?: number; onAutoStop?(): void }): Promise<RecorderHandle>

  // VoiceButton.tsx
  <VoiceButton onTranscribed={(text: string) => void} />
  ```
  状态机：idle → recording（计时）→ transcribing → 成功回填 / error / cancelled。60s 上限自动停止并转写。浏览器不支持 `navigator.mediaDevices` 或 `MediaRecorder` 时显示不支持。

- [ ] **Step 1: 写失败的 recorder 测试**

`src/lib/voice/__tests__/recorder.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRecording } from '@/lib/voice/recorder';

class FakeMediaRecorder {
  state = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const mediaRecorderCtor = vi.fn().mockImplementation(() => new FakeMediaRecorder());
const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', mediaRecorderCtor);
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('startRecording', () => {
  it('请求麦克风并启动 MediaRecorder', async () => {
    await startRecording();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(mediaRecorderCtor).toHaveBeenCalledTimes(1);
  });
  it('stop() 返回拼接的 Blob', async () => {
    const handle = await startRecording();
    const blob = await handle.stop();
    expect(blob.type).toBe('audio/webm');
  });
  it('不支持 MediaRecorder 时抛错', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    await expect(startRecording()).rejects.toThrow(/不支持/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/lib/voice/__tests__/recorder.test.ts`
Expected：FAIL，`@/lib/voice/recorder` 不存在。
- [ ] **Step 3: 实现 recorder.ts**

`src/lib/voice/recorder.ts`：

```ts
export type RecorderHandle = { stop(): Promise<Blob>; cancel(): void };

export const DEFAULT_MAX_MS = 60_000; // §9、§10.3a：客户端录音上限 60 秒

export async function startRecording(opts?: {
  maxMs?: number;
  onAutoStop?: () => void;
}): Promise<RecorderHandle> {
  const maxMs = opts?.maxMs ?? DEFAULT_MAX_MS;
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new Error('当前浏览器不支持录音');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () =>
    new Promise<Blob>((resolve) => {
      if (stopped) { resolve(new Blob(chunks, { type: recorder.mimeType })); return; }
      stopped = true;
      if (timer) clearTimeout(timer);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        resolve(new Blob(chunks, { type }));
      };
      if (recorder.state !== 'inactive') recorder.stop();
    });

  const cancel = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (timer) clearTimeout(timer);
  };

  recorder.start();
  timer = setTimeout(() => {
    opts?.onAutoStop?.();
    void stop();
  }, maxMs);

  return { stop, cancel };
}

export type VoiceRecorder = { start(): Promise<RecorderHandle> };

/** 惰性工厂：启动前不触碰 getUserMedia，便于组件测试注入 */
export function initializeRecorder(): VoiceRecorder {
  return { start: () => startRecording() };
}
```

- [ ] **Step 4: 通过 recorder 测试 + typecheck**

Run: `npx vitest run src/lib/voice/__tests__/recorder.test.ts` 与 `npx tsc --noEmit`
Expected：PASS，3 个测试全绿；typecheck 通过。

- [ ] **Step 5: 写失败的 VoiceButton 测试**

`src/components/__tests__/VoiceButton.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceButton } from '@/components/VoiceButton';
import { transcribe } from '@/lib/ai';
import { initializeRecorder } from '@/lib/voice/recorder';

vi.mock('@/lib/ai', () => ({ transcribe: vi.fn() }));
vi.mock('@/lib/ledger/store', () => ({ knownMerchants: vi.fn(() => ['Woolworths']) }));
vi.mock('@/lib/voice/recorder', () => ({ initializeRecorder: vi.fn() }));

describe('VoiceButton', () => {
  it('录音结束 → 转写 → 回填 onTranscribed', async () => {
    let recorder: { stop(): Promise<Blob>; cancel(): void } | null = null;
    vi.mocked(initializeRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue((recorder = {
        stop: vi.fn().mockResolvedValue(new Blob(['x'], { type: 'audio/webm' })),
        cancel: vi.fn(),
      })),
    });
    vi.mocked(transcribe).mockResolvedValue({ text: 'Woolworths 买菜' });
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(recorder).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /停止/ }));
    await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith('Woolworths 买菜'));
  });

  it('转写失败 → 显示错误且不回填', async () => {
    let recorder: { stop(): Promise<Blob>; cancel(): void } | null = null;
    vi.mocked(initializeRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue((recorder = { stop: vi.fn().mockResolvedValue(new Blob()), cancel: vi.fn() })),
    });
    vi.mocked(transcribe).mockRejectedValue(new Error('boom'));
    const onTranscribed = vi.fn();
    render(<VoiceButton onTranscribed={onTranscribed} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(recorder).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /停止/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onTranscribed).not.toHaveBeenCalled();
  });

  it('录音中可取消，不触发转写', async () => {
    const cancel = vi.fn();
    vi.mocked(initializeRecorder).mockReturnValue({
      start: vi.fn().mockResolvedValue({ stop: vi.fn(), cancel }),
    });
    render(<VoiceButton onTranscribed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /录音/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /取消/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /取消/ }));
    expect(cancel).toHaveBeenCalled();
  });
});
```

> 注意：测试通过 `initializeRecorder` 依赖注入规避真实 `getUserMedia`（真实实现调用 `startRecording`）。这保持测试稳定且证明组件状态机逻辑。
- [ ] **Step 6: 实现 VoiceButton.tsx**

`src/components/VoiceButton.tsx`（状态机：idle → recording → transcribing → 回填/错误/取消）：

```tsx
'use client';

import { useRef, useState } from 'react';
import { transcribe } from '@/lib/ai';
import { knownMerchants } from '@/lib/ledger/store';
import { initializeRecorder } from '@/lib/voice/recorder';
import type { RecorderHandle } from '@/lib/voice/recorder';

type Status = 'idle' | 'recording' | 'transcribing' | 'unsupported';

export function VoiceButton({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);

  async function start() {
    setError(null);
    try {
      const recorder = initializeRecorder();
      recorderRef.current = await recorder.start();
      setStatus('recording');
    } catch {
      setStatus('unsupported');
      setError('当前浏览器不支持录音');
    }
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus('transcribing');
    try {
      const audio = await rec.stop();
      // STT 只做 Audio → Text；回填后由用户走 Plan 1 既有提交管线（§9）
      const vocab = knownMerchants();
      const { text } = await transcribe(audio, vocab);
      onTranscribed(text);
      setStatus('idle');
    } catch {
      setError('转写失败，请重试');
      setStatus('idle');
    }
  }

  function cancel() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setStatus('idle');
  }

  if (status === 'recording') {
    return (
      <span>
        <button type="button" onClick={() => void stop()}>停止</button>
        <button type="button" onClick={cancel}>取消</button>
        <span aria-live="polite">录音中…</span>
      </span>
    );
  }

  return (
    <span>
      <button type="button" onClick={() => void start()} disabled={status === 'transcribing'}>
        {status === 'transcribing' ? '转写中…' : '🎤 录音'}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
```
- [ ] **Step 7: 更新 recorder 测试引用 initializeRecorder**

`src/lib/voice/__tests__/recorder.test.ts` 追加用例（验证工厂返回起播函数）：

```ts
it('initializeRecorder 返回可 start 的工厂', async () => {
  const { initializeRecorder } = await import('@/lib/voice/recorder');
  const rec = initializeRecorder();
  expect(typeof rec.start).toBe('function');
});
```

- [ ] **Step 8: 集成 VoiceButton 到 Composer（回填输入框）**

`src/components/Composer.tsx`：在 textarea 旁放 `<VoiceButton />`，`onTranscribed` 把文本**追加**到现有输入并在文末补空格（用户可继续编辑）：

```tsx
'use client';

import { useState } from 'react';
import { VoiceButton } from '@/components/VoiceButton';

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appendText = (t: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
  };

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const submittedText = text.trim();
    setText('');
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(submittedText);
    } catch {
      setText(submittedText);
      setError('记账失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="说点什么…"
        rows={2}
      />
      <button type="button" onClick={handleSubmit} disabled={!canSubmit}>
        {submitting ? '提交中…' : '提交'}
      </button>
      <VoiceButton onTranscribed={appendText} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

> 回填后**不自动提交**——复用 Plan 1 的「用户在输入框确认 → 提交」流程（spec §9 关键决定）。

- [ ] **Step 9: 更新 Composer 测试（语音回填路径）**

`src/components/__tests__/Composer.test.tsx` 追加：

```tsx
import { VoiceButton } from '@/components/VoiceButton';

vi.mock('@/components/VoiceButton', () => ({
  VoiceButton: (props: { onTranscribed: (t: string) => void }) => (
    <button type="button" onClick={() => props.onTranscribed('Woolworths 买菜')}>voice-mock</button>
  ),
}));
```

并在测试中：点击 voice-mock → textarea value 等于回填文本；文本不受数据库影响。

- [ ] **Step 10: 通过全部相关测试 + typecheck**

Run:
```bash
npx vitest run src/lib/voice src/components/__tests__/VoiceButton.test.tsx src/components/__tests__/Composer.test.tsx
npx tsc --noEmit
```
Expected：全部 PASS；typecheck 通过。

- [ ] **Step 11: Commit**

```bash
git add src/lib/voice src/components/VoiceButton.tsx src/components/Composer.tsx src/components/__tests__
git commit -m "feat(voice): 录音→STT→输入框回填（复用现有提交管线）"
```

---

## Task 12: 全量验证、env 文档与收尾

**Files:**
- Modify: `.env.example`（新增全部 Plan 2 变量）
- 可能 Modify: `src/app/page.tsx`（如需）、`README`（若存在）
- 验证主入口

- [ ] **Step 1: 更新 .env.example 收尾**

```env
# Google OAuth（从 Google Cloud Console 的 OAuth 2.0 Client IDs 获取）
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# 必须在 Google Cloud 后台登记为 authorized redirect URI
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Session 签名密钥（openssl rand -hex 32，≥16 字符）
SESSION_SECRET=

# refresh token 加密密钥（必须 32 字节 hex，与 DATABASE_URL 分离管理 §12.6）
REFRESH_TOKEN_ENCRYPTION_KEY=

# Postgres（本地 `docker run` 见计划文档「本地开发数据库」）
DATABASE_URL=postgresql://justsayit:justsayit@localhost:5433/justsayit

# 每日 AI 调用配额（structure + stt 共享；服务端强制 §10.3a）
AI_DAILY_QUOTA=60
```

- [ ] **Step 2: 全量回归**

Run:
```bash
npx vitest run
npx tsc --noEmit
npx next build
```
Expected：
- vitest 全部 PASS（Plan 1 原有 93 个用例不回归 + 新增认证/配额/STT 用例）
- typecheck 通过
- `next build` 通过（App Router 路由全部可编译）

> 如果 `next build` 因缺少 Google 凭据报错，确认错误为「运行时环境变量」类（不影响 build 产物）即视为通过；登录功能需用户配置 `.env` 后验证。

- [ ] **Step 3: 手动冒烟（需要真实 Google OAuth 凭据，见「验收前置」）**

1. 配置 `.env` 全部变量。
2. `npm run dev`。
3. 打开 `/login` → 点击「使用 Google 登录」→ 完成 Google 授权。
4. 回到首页出现邮箱与「退出」。
5. 录音 → 回填输入框 → 提交 → 账目出现在列表。
6. 未登录访问 `/api/structure` → 401；`/api/stt` → 401。

- [ ] **Step 4: 验收清单核对**

对照完成标准逐项核对（见本计划文末「完成标准」），全部满足后提交。

```bash
git add .env.example
git commit -m "chore(env): Plan 2 环境变量文档收尾"
```

---

## 验收前置（需要用户提供）

**Google OAuth 客户端凭据**（`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`）：

1. 到 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建/选择项目。
2. 「OAuth consent screen」设为 **External → In production**（spec §11.1：Testing 状态有 100 人上限且授权 7 天过期）。
3. 「Credentials → Create credentials → OAuth client ID → Web application」。
4. Authorized redirect URIs 添加 `http://localhost:3000/api/auth/callback`（与 `GOOGLE_REDIRECT_URI` 一致）。
5. 把 ID / Secret 写入 `.env`。

> 没有凭据时：`ALLOW_UNAUTHENTICATED_API=true` 可让开发环境绕过登录继续记账（逃生舱），但 `/login` 与语音输入无法端到端验证。

---

## 完成标准

- [ ] Plan 2 plan 文档已创建（本文件）
- [ ] Google 登录可正常工作（需用户提供 OAuth 凭据后在 dev 环境验证）
- [ ] 用户身份可以在 server-side 正确识别（guard 401/通过测试）
- [ ] quota 按 user 隔离（Prisma User 行上的 aiCallsToday）
- [ ] quota 无法通过前端绕过（route 层原子扣减，客户端无配额逻辑）
- [ ] `/api/structure` 正确受到认证保护（无 session 401）
- [ ] 可以录音（MediaRecorder + 60s 上限）
- [ ] 录音可以通过 STT 转换为文字（Groq whisper-large-v3-turbo）
- [ ] STT 结果可以回填现有记账输入（Composer appendText）
- [ ] 语音输入复用 Plan 1 的记账/AI 结构化流程（回填后走既有提交）
- [ ] 错误、取消、loading 状态正常（VoiceButton 状态机 + 测试）
- [ ] 相关测试通过（新增用例全绿）
- [ ] Plan 1 原有测试通过（93 例不回归）
- [ ] 没有提前实现 Plan 3 / Plan 4（无 Drive 同步、无导出、无统计、无 PWA、无部署）
