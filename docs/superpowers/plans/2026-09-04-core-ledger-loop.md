# JustSayIt Plan 1：核心记账闭环 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户打字描述消费，AI 结构化成账目，存入本地事件日志，在按日分组的列表中看到——完整可跑通的记账闭环。

**Architecture:** 事件日志是唯一真相来源，存于 IndexedDB，只追加不修改。启动时全量读出、在内存中重放成账本状态，UI 通过 `useSyncExternalStore` 订阅。AI 结构化经后端代理调用 Groq，返回值由 Zod 二次校验后才允许入库。

**Tech Stack:** Node 24 · Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Zod · idb · Vitest · fake-indexeddb · Groq (`qwen/qwen3.8-27b`)

**Spec:** `docs/superpowers/specs/2026-09-04-justsayit-design.md`（提交于 `bce590b`）

## Global Constraints

以下为 spec 中的项目级硬性要求，**每个任务都隐含包含本节**：

- **金额以整数分存储，绝不用浮点数落盘**（spec §5.3 规则三）。AI 返回「元」的 `number`，入库前 `Math.round(x * 100)`，且必须先校验小数位 ≤ 2。
- **收支方向的唯一来源是 `type` 字段，`amount` 永远为正**（§5.3 规则二）。禁止用负数表示收入。
- **分类必须是 17 个枚举之一，且在 structured output 的 schema 层强制**（§5.3 规则一），不靠提示词请求。
- **事件不可变。** 修改与删除表达为追加新事件，永不改写已有事件（§5.1）。
- **零内容日志**（§10.5）：后端日志只记 `userId`、模型名、token 数、耗时、成功/失败、错误类型，**永不记录 prompt 与 response 内容**。
- **provider 隔离**（§10.3）：provider 的**具体取值**——模型 ID（`qwen/...`）、端点 `api.groq.com`、`reasoning_effort`、`json_schema`/`strict` 等私有参数——只允许出现在 `src/lib/ai/providers/groq.ts` 一个文件。`src/lib/ai/index.ts` 按名字 import 该 provider 属于接缝本身，不算泄漏。可执行判据见 Task 4 Step 5 与 Task 14 Step 6。
- **提示词只讲抽取规则，不讲输出格式**（§10.6），且**必须包含全部 17 个分类的中文释义**（§10.2a）——这是正确性要求，不是调优。
- **Groq 调用参数固定**：`model=qwen/qwen3.8-27b`、`temperature=0`、`reasoning_effort='none'`、`response_format` 为 strict json_schema（§10.2）。
- **Groq strict 模式 schema 要求**（§10.2b）：所有字段必须列入 `required`、所有对象 `additionalProperties: false`、可空字段用 `{"type":["string","null"]}` 而非 `nullable`。
- **`getSnapshot` 只返回整个 ledger**，任何派生用 `useMemo`（§6.6）。在 `getSnapshot` 里做筛选会导致无限重渲染。
- **核心版本锁定**：Node 24、Next 16、React 19、Tailwind v4、TypeScript 5。包管理器 npm。开发机与生产（`node:24-alpine`）同为 Node 24，约束由 `package.json` 的 `engines` 配合 `.npmrc` 的 `engine-strict=true` 强制执行。安装后必须核对实际 major 版本（Task 1 Step 1），不接受未固定版本解析出的其他 major——`tsc --noEmit` 是后续每个任务的必过关卡，版本漂移的代价是整条链返工。
- **本 Plan 不做视觉设计。** 组件只写语义化 HTML 结构，不写 `className` 样式。Tailwind v4 在 Task 1 接好管线即可，具体样式由用户后续自行编写。

---

## File Structure

| 文件 | 职责 |
|---|---|
| `src/lib/ai/schema.ts` | **唯一真相源**：分类枚举、AI 输出契约、入库后的 Transaction 类型、元→分转换 |
| `src/lib/ai/prompt.ts` | 系统提示词（含 17 分类释义）与上下文注入格式。共享资产，不属于任何 provider |
| `src/lib/ai/providers/groq.ts` | **唯一允许出现 provider 细节的文件**：Groq HTTP 调用、strict schema 派生 |
| `src/lib/ai/index.ts` | 窄接口 `structure(text, ctx)`，对业务层隐藏 provider |
| `src/lib/ledger/events.ts` | 事件类型定义与构造函数 |
| `src/lib/ledger/db.ts` | IndexedDB 封装，只有 `appendEvents` / `readAllEvents` |
| `src/lib/ledger/replay.ts` | 事件序列 → 账本状态（纯函数） |
| `src/lib/ledger/normalize.ts` | merchant 归一化（§5.3 规则四） |
| `src/lib/ledger/store.ts` | 内存 store + `subscribe` / `getSnapshot` / `addTransactions` |
| `src/app/api/structure/route.ts` | 代理端点：校验入参 → 调 `lib/ai` → 返回 |
| `src/components/Composer.tsx` | 输入区：文本框 + 提交按钮 + submitting 状态 |
| `src/components/TransactionRow.tsx` | 单条账目行（Plan 4 的统计明细将复用此组件） |
| `src/components/LedgerList.tsx` | 按日分组的列表 |
| `src/app/globals.css` | Tailwind v4 入口（`@import "tailwindcss";`），本 Plan 不写具体样式 |
| `src/app/page.tsx` | 主屏组装 |

---

## Task 1: 项目脚手架与测试环境

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `.env.example`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 `npm test` 与 `npm run dev`；路径别名 `@/*` → `src/*`；Tailwind v4 管线就绪

- [ ] **Step 1: 初始化项目并安装依赖**

```bash
node -v    # 必须是 v24.x
npm init -y
npm install next@^16 react@^19 react-dom@^19 zod idb
npm install -D typescript@^5 @types/node@^24 @types/react@^19 @types/react-dom@^19 \
  tailwindcss@^4 @tailwindcss/postcss \
  vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/user-event \
  fake-indexeddb
```

装完立刻核对 major 版本，**不符必须停下修正**（`@latest` 会随时间漂移到别的 major，事后再发现要重做后续所有任务）：

Run: `npm ls next react react-dom tailwindcss typescript --depth=0`
Expected: `next@16.x`、`react@19.x`、`react-dom@19.x`、`tailwindcss@4.x`、`typescript@5.x`

**TypeScript 必须留在 5.x**：7.x 是 Go 重写的新编译器，与生态的 `@types` 和工具链不同源。不写 `@^5` 就会静默装上 7.x——这正是本步骤存在的理由。

**Node 版本锁定**：开发机与生产（Plan 4 的 `node:24-alpine`）同为 Node 24 LTS。把它写成可执行的约束，而不是一句口头约定——`package.json`：

```json
{
  "engines": { "node": ">=24 <25" }
}
```

根目录 `.npmrc`：

```
engine-strict=true
```

`engine-strict=true` 让 npm 在 Node 版本不符时**直接拒绝安装**。npm 的默认值是 false，也就是默认只警告不拦截；既然开发机已经在 24 上，就没有理由留着这个逃生口——它唯一的作用是让版本漂移悄悄发生。

- [ ] **Step 2: 写配置文件**

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`：

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

`postcss.config.mjs`（Tailwind v4 通过 PostCSS 插件接入；v4 默认没有 `tailwind.config.js`，配置写在 CSS 里）：

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

`vitest.setup.ts`：

```ts
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: 在 package.json 中加入脚本**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 4: 写最小页面骨架**

`src/app/globals.css`（Tailwind v4 是 CSS-first：一行 import 即全部，不再需要 `@tailwind base/components/utilities` 三段式）：

```css
@import "tailwindcss";
```

`src/app/layout.tsx`：

```tsx
import './globals.css';

export const metadata = { title: 'JustSayIt' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`：

```tsx
export default function Home() {
  return <main>JustSayIt</main>;
}
```

- [ ] **Step 5: 写环境变量样例并更新 .gitignore**

`.env.example`：

```
# Groq API key —— 从 https://console.groq.com/keys 获取
GROQ_API_KEY=

# 非 development 时，未鉴权的 /api/structure 会返回 403（Plan 2 接入认证后移除）
ALLOW_UNAUTHENTICATED_API=false
```

在 `.gitignore` 末尾追加：

```
next-env.d.ts
.next/
coverage/
*.tsbuildinfo
```

- [ ] **Step 6: 写一个冒烟测试确认测试环境可用**

`src/lib/__tests__/smoke.test.ts`：

```ts
import { describe, it, expect } from 'vitest';

describe('测试环境', () => {
  it('fake-indexeddb 已注入', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).not.toBeNull();
  });
});
```

- [ ] **Step 7: 运行测试与类型检查**

Run: `npm test && npm run typecheck`
Expected: 1 passed；tsc 无错误

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: 初始化 Next.js 项目与 Vitest 测试环境"
```

---

## Task 2: 数据契约（Zod schema）

**Files:**
- Create: `src/lib/ai/schema.ts`
- Test: `src/lib/ai/__tests__/schema.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `EXPENSE_CATEGORIES`, `INCOME_CATEGORIES`, `ALL_CATEGORIES: readonly string[]`
  - `type CategoryKey`
  - `AiTransactionSchema: z.ZodType<AiTransaction>`（AI 输出契约，金额单位「元」）
  - `AiResponseSchema`（`{ records: AiTransaction[] }`）
  - `type Transaction`（入库形态，金额为整数分，`currency` 永不为 null）
  - `toCents(yuan: number): number`
  - `toTransaction(ai: AiTransaction, opts: { id: string; defaultCurrency: string }): Transaction`

- [ ] **Step 1: 写失败的测试**

`src/lib/ai/__tests__/schema.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import {
  ALL_CATEGORIES,
  AiTransactionSchema,
  AiResponseSchema,
  toCents,
  toTransaction,
} from '@/lib/ai/schema';

const valid = {
  type: 'EXPENSE' as const,
  amount: 54.3,
  currency: null,
  date: '2026-09-04',
  category: 'FOOD' as const,
  merchant: 'Woolworths',
  description: '买菜',
};

describe('分类枚举', () => {
  it('共 17 个 key 且无重复', () => {
    expect(ALL_CATEGORIES).toHaveLength(17);
    expect(new Set(ALL_CATEGORIES).size).toBe(17);
  });
});

describe('AiTransactionSchema', () => {
  it('接受合法记录', () => {
    expect(AiTransactionSchema.parse(valid)).toMatchObject({ amount: 54.3 });
  });

  it('拒绝负数金额（方向只由 type 表示）', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: -5 }).success).toBe(false);
  });

  it('拒绝超过两位小数的金额', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 1.005 }).success).toBe(false);
  });

  it('接受恰好两位小数', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 18.9 }).success).toBe(true);
    expect(AiTransactionSchema.safeParse({ ...valid, amount: 0.01 }).success).toBe(true);
  });

  it('拒绝枚举外的分类', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: '餐饮' }).success).toBe(false);
  });

  it('拒绝 EXPENSE 配收入专用分类', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: 'SALARY' }).success).toBe(false);
  });

  it('允许 OTHER 用于收支两侧', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, category: 'OTHER' }).success).toBe(true);
    expect(
      AiTransactionSchema.safeParse({ ...valid, type: 'INCOME', category: 'OTHER' }).success,
    ).toBe(true);
  });

  it('拒绝非 YYYY-MM-DD 的日期', () => {
    expect(AiTransactionSchema.safeParse({ ...valid, date: '2026/09/04' }).success).toBe(false);
  });
});

describe('AiResponseSchema', () => {
  it('允许空数组（输入不含账目时）', () => {
    expect(AiResponseSchema.parse({ records: [] }).records).toEqual([]);
  });
});

describe('toCents', () => {
  it('两位小数金额转换精确', () => {
    expect(toCents(54.3)).toBe(5430);
    expect(toCents(18.9)).toBe(1890);
    expect(toCents(25)).toBe(2500);
    expect(toCents(0.01)).toBe(1);
    expect(toCents(2400)).toBe(240000);
  });
});

describe('toTransaction', () => {
  it('金额转为整数分，currency 为 null 时补默认值', () => {
    const t = toTransaction(valid, { id: 'tx1', defaultCurrency: 'AUD' });
    expect(t.amountCents).toBe(5430);
    expect(t.currency).toBe('AUD');
    expect(t.id).toBe('tx1');
  });

  it('AI 明确给出币种时不被默认值覆盖', () => {
    const t = toTransaction({ ...valid, currency: 'USD' }, { id: 'tx2', defaultCurrency: 'AUD' });
    expect(t.currency).toBe('USD');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ai/__tests__/schema.test.ts`
Expected: FAIL，`Failed to resolve import "@/lib/ai/schema"`

- [ ] **Step 3: 实现**

`src/lib/ai/schema.ts`：

```ts
import { z } from 'zod';

/** 支出专用分类（spec §5.2） */
export const EXPENSE_CATEGORIES = [
  'FOOD', 'TRANSPORT', 'SHOPPING', 'HOUSING', 'DAILY',
  'ENTERTAINMENT', 'MEDICAL', 'EDUCATION', 'SOCIAL',
  'SUBSCRIPTION', 'TRAVEL',
] as const;

/** 收入专用分类 */
export const INCOME_CATEGORIES = [
  'SALARY', 'SIDE_INCOME', 'INVESTMENT', 'REFUND', 'GIFT',
] as const;

/** 收支共用 */
export const SHARED_CATEGORIES = ['OTHER'] as const;

export const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  ...SHARED_CATEGORIES,
] as const;

export type CategoryKey = (typeof ALL_CATEGORIES)[number];

/** 金额最多两位小数——规则三的前置校验，越界则 toCents 不再可证明正确 */
const atMostTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

export const AiTransactionSchema = z
  .object({
    type: z.enum(['EXPENSE', 'INCOME']),
    // 单位「元」。永远为正——方向只由 type 表示（规则二）
    amount: z.number().positive().finite().refine(atMostTwoDecimals, {
      message: '金额最多两位小数',
    }),
    // 仅当用户明确说出币种时非空，否则由客户端补默认值
    currency: z.string().length(3).nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期须为 YYYY-MM-DD'),
    category: z.enum(ALL_CATEGORIES),
    merchant: z.string().nullable(),
    description: z.string(),
  })
  .superRefine((t, ctx) => {
    const allowed: readonly string[] =
      t.type === 'EXPENSE'
        ? [...EXPENSE_CATEGORIES, ...SHARED_CATEGORIES]
        : [...INCOME_CATEGORIES, ...SHARED_CATEGORIES];
    if (!allowed.includes(t.category)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: `分类 ${t.category} 不适用于 ${t.type}`,
      });
    }
  });

export type AiTransaction = z.infer<typeof AiTransactionSchema>;

export const AiResponseSchema = z.object({
  records: z.array(AiTransactionSchema),
});

export type AiResponse = z.infer<typeof AiResponseSchema>;

/** 入库形态：金额为整数分，currency 永不为 null */
export type Transaction = {
  id: string;
  type: 'EXPENSE' | 'INCOME';
  amountCents: number;
  currency: string;
  date: string;
  category: CategoryKey;
  merchant: string | null;
  description: string;
};

/**
 * 元 → 整数分。
 * 对恰好两位小数的值可证明正确（1.005 这类三位小数已被 schema 拒绝）。
 */
export function toCents(yuan: number): number {
  return Math.round(yuan * 100);
}

export function toTransaction(
  ai: AiTransaction,
  opts: { id: string; defaultCurrency: string },
): Transaction {
  return {
    id: opts.id,
    type: ai.type,
    amountCents: toCents(ai.amount),
    currency: ai.currency ?? opts.defaultCurrency,
    date: ai.date,
    category: ai.category,
    merchant: ai.merchant,
    description: ai.description,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ai/__tests__/schema.test.ts`
Expected: PASS，14 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/schema.ts src/lib/ai/__tests__/schema.test.ts
git commit -m "feat(ai): 定义 Transaction 数据契约与分类枚举"
```

---

## Task 3: 系统提示词

**Files:**
- Create: `src/lib/ai/prompt.ts`
- Test: `src/lib/ai/__tests__/prompt.test.ts`

**Interfaces:**
- Consumes: `ALL_CATEGORIES` from `@/lib/ai/schema`
- Produces:
  - `type StructureContext = { localTime: string; timeZone: string; defaultCurrency: string }`
  - `buildSystemPrompt(ctx: StructureContext): string`

- [ ] **Step 1: 写失败的测试**

`src/lib/ai/__tests__/prompt.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/lib/ai/prompt';
import { ALL_CATEGORIES } from '@/lib/ai/schema';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

describe('buildSystemPrompt', () => {
  it('注入时间基准、时区与默认币种', () => {
    const p = buildSystemPrompt(ctx);
    expect(p).toContain('2026-09-04T19:30:00+10:00');
    expect(p).toContain('Australia/Sydney');
    expect(p).toContain('AUD');
  });

  it('包含全部 17 个分类 key 的释义（§10.2a 正确性要求）', () => {
    const p = buildSystemPrompt(ctx);
    for (const key of ALL_CATEGORIES) {
      expect(p, `缺少分类释义: ${key}`).toContain(key);
    }
  });

  it('不含任何输出格式指令（§10.6 提示词纪律）', () => {
    const p = buildSystemPrompt(ctx);
    // 不只禁「JSON」字样——也禁复述 schema 信封与字段形状，
    // 否则「不讲输出格式」这条断言会被措辞绕过（如「返回空的 records 数组」）。
    expect(p).not.toMatch(/JSON|```|markdown|输出格式|records|字段/i);
  });

  it('明确要求无账目时返回空数组', () => {
    expect(buildSystemPrompt(ctx)).toContain('空');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ai/__tests__/prompt.test.ts`
Expected: FAIL，无法解析 `@/lib/ai/prompt`

- [ ] **Step 3: 实现**

`src/lib/ai/prompt.ts`：

```ts
export type StructureContext = {
  /** 用户本地时间，ISO 8601 含时区偏移 */
  localTime: string;
  /** IANA 时区，如 Australia/Sydney */
  timeZone: string;
  /** 用户档案默认币种，ISO 4217 */
  defaultCurrency: string;
};

/**
 * 分类释义。
 * 这不是调优而是正确性要求（spec §10.2a）——缺少释义时实测出现
 * 「Woolworths 买菜」被归入 GIFT 的错误。
 */
const CATEGORY_GLOSSARY = `   FOOD 餐饮、买菜、外卖、咖啡、零食
   TRANSPORT 交通、加油、停车、打车、公共交通
   SHOPPING 服饰、电子产品、家居用品等非日常采购
   HOUSING 房租、房贷、水电煤、物业
   DAILY 日用消耗品、清洁用品、个护
   ENTERTAINMENT 娱乐、订票、游戏、健身
   MEDICAL 医疗、药品、看诊
   EDUCATION 学费、书籍、课程
   SOCIAL 人情往来、请客、红包
   SUBSCRIPTION 订阅服务、会员费
   TRAVEL 旅行、住宿、机票
   SALARY 工资
   SIDE_INCOME 副业收入
   INVESTMENT 投资收益
   REFUND 退款
   GIFT 收到的礼金
   OTHER 无法归入以上任何一类`;

/**
 * 系统提示词。
 * 只讲抽取规则，不讲输出格式——格式由 structured output 的 schema 负责（§10.6）。
 */
export function buildSystemPrompt(ctx: StructureContext): string {
  return `你是一个记账信息抽取器。从用户输入中抽取所有收入和支出记录。

【上下文】
当前本地时间：${ctx.localTime}
用户时区：${ctx.timeZone}
默认币种：${ctx.defaultCurrency}

【抽取规则】
1. 一条输入包含多笔收支时，拆分成多条记录。
2. amount 永远为正数。收支方向只由 type 表示，不要用负数表示收入。
3. amount 单位为「元」，最多两位小数。口语化表达（如"五十四块三"）转成 54.3。
4. date 依据上文的当前本地时间推算，输出 YYYY-MM-DD。"今天""昨天""上周五"等
   相对表达必须解析成绝对日期；没有时间线索时用今天。
5. currency 只在用户明确说出币种时填写（如"美元""欧元"），否则填 null。
   仅出现"块""元"等不含币种信息的量词时，一律填 null。
6. merchant 填写可识别的商户或品牌名，有官方英文名的品牌使用官方英文写法
   （McDonald's、Woolworths、Uber Eats），无法识别时填 null。
7. description 简要描述事由，不要重复 merchant 的内容。
8. category 从下列释义中选择，无法判断时用 OTHER：
${CATEGORY_GLOSSARY}
9. 输入中不包含任何收支信息时，不要生成任何记录，也不要凭空编造。`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ai/__tests__/prompt.test.ts`
Expected: PASS，4 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt.ts src/lib/ai/__tests__/prompt.test.ts
git commit -m "feat(ai): 系统提示词与 17 分类释义"
```

---

## Task 4: Groq 适配器

**Files:**
- Create: `src/lib/ai/providers/groq.ts`
- Test: `src/lib/ai/providers/__tests__/groq.test.ts`

**Interfaces:**
- Consumes: `AiResponseSchema`, `ALL_CATEGORIES` from `@/lib/ai/schema`；`buildSystemPrompt`, `StructureContext` from `@/lib/ai/prompt`
- Produces: `groqStructure(text: string, ctx: StructureContext): Promise<AiTransaction[]>`

**注意：这是全项目唯一允许出现 "groq"、模型 ID 与 provider 参数的文件（§10.3）。**

- [ ] **Step 1: 写失败的测试**

`src/lib/ai/providers/__tests__/groq.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groqStructure } from '@/lib/ai/providers/groq';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

function mockGroqReply(records: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ records }) } }],
      usage: { prompt_tokens: 497, completion_tokens: 63 },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groqStructure', () => {
  it('解析出账目记录', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockGroqReply([
          {
            type: 'EXPENSE',
            amount: 54.3,
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: 'Woolworths',
            description: '买菜',
          },
        ]),
      ),
    );
    const out = await groqStructure('Woolworths 买菜五十四块三', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(54.3);
  });

  it('请求体带上 strict schema 与固定参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockGroqReply([]));
    vi.stubGlobal('fetch', fetchMock);
    await groqStructure('今天天气不错', ctx);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe('none');
    expect(body.response_format.json_schema.strict).toBe(true);

    // Groq strict 模式要求（§10.2b）
    const item = body.response_format.json_schema.schema.properties.records.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(
      expect.arrayContaining(['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description']),
    );
    expect(item.properties.currency.type).toEqual(['string', 'null']);
    expect(item.properties.merchant.type).toEqual(['string', 'null']);
  });

  it('空输入返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockGroqReply([])));
    expect(await groqStructure('今天天气不错', ctx)).toEqual([]);
  });

  it('模型返回不合契约时抛错（运行时校验是最后防线）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockGroqReply([
          {
            type: 'EXPENSE',
            amount: -5, // 负数违反规则二
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: null,
            description: 'x',
          },
        ]),
      ),
    );
    await expect(groqStructure('x', ctx)).rejects.toThrow(/校验/);
  });

  it('HTTP 错误时抛出且不泄漏请求内容', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      } as unknown as Response),
    );
    await expect(groqStructure('买菜54块3', ctx)).rejects.toThrow(/429/);
    await expect(groqStructure('买菜54块3', ctx)).rejects.not.toThrow(/买菜/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ai/providers/__tests__/groq.test.ts`
Expected: FAIL，无法解析 `@/lib/ai/providers/groq`

- [ ] **Step 3: 实现**

`src/lib/ai/providers/groq.ts`：

```ts
import {
  ALL_CATEGORIES,
  AiResponseSchema,
  type AiTransaction,
} from '@/lib/ai/schema';
import { buildSystemPrompt, type StructureContext } from '@/lib/ai/prompt';

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'qwen/qwen3.8-27b';

/**
 * Groq strict 模式的 schema 要求（spec §10.2b）：
 * 所有字段必须 required、对象必须 additionalProperties:false、
 * 可空字段用联合类型而非 nullable。
 */
const STRICT_SCHEMA = {
  type: 'object',
  properties: {
    records: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['EXPENSE', 'INCOME'] },
          amount: { type: 'number' },
          currency: { type: ['string', 'null'] },
          date: { type: 'string' },
          category: { type: 'string', enum: [...ALL_CATEGORIES] },
          merchant: { type: ['string', 'null'] },
          description: { type: 'string' },
        },
        required: ['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['records'],
  additionalProperties: false,
} as const;

export async function groqStructure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('缺少 GROQ_API_KEY');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: text },
      ],
      temperature: 0,
      reasoning_effort: 'none',
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'transactions', strict: true, schema: STRICT_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    // 只带状态码，绝不把用户输入或响应体写进错误信息（§10.5 零内容日志）
    throw new Error(`Groq 请求失败：HTTP ${res.status}`);
  }

  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error('Groq 返回内容不是合法 JSON');
  }

  // 运行时校验是数据质量的最后防线（§10.4）——即使用了 structured output 也不跳过
  const parsed = AiResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Groq 返回值未通过契约校验：${parsed.error.issues[0]?.message ?? '未知'}`);
  }
  return parsed.data.records;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ai/providers/__tests__/groq.test.ts`
Expected: PASS，5 个测试全绿

- [ ] **Step 5: 验证 provider 隔离判据**

Run: `grep -rl "groq" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: 至多两个文件——`src/lib/ai/index.ts`（**仅** import 语句提及）与 `src/lib/ai/providers/groq.ts`。Task 5 之前只有后者。

Run: `grep -rlE "qwen|api\.groq\.com|reasoning_effort|json_schema" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: 只输出 `src/lib/ai/providers/groq.ts`。**这一条才是真正的隔离判据**——provider 的具体取值（模型 ID、端点、私有参数）只能存在于一个文件；窄接口按名字引用 provider 是接缝本身，不是泄漏。

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/providers/groq.ts src/lib/ai/providers/__tests__/groq.test.ts
git commit -m "feat(ai): Groq 结构化适配器与 strict schema"
```

---

## Task 5: AI 窄接口

**Files:**
- Create: `src/lib/ai/index.ts`
- Test: `src/lib/ai/__tests__/index.test.ts`

**Interfaces:**
- Consumes: `groqStructure` from `@/lib/ai/providers/groq`
- Produces: `structure(text: string, ctx: StructureContext): Promise<AiTransaction[]>`

- [ ] **Step 1: 写失败的测试**

`src/lib/ai/__tests__/index.test.ts`：

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/providers/groq', () => ({
  groqStructure: vi.fn().mockResolvedValue([
    {
      type: 'EXPENSE',
      amount: 25,
      currency: null,
      date: '2026-09-04',
      category: 'FOOD',
      merchant: null,
      description: '早餐',
    },
  ]),
}));

import { structure } from '@/lib/ai';
import { groqStructure } from '@/lib/ai/providers/groq';

describe('structure', () => {
  it('把调用转交给 provider 并原样返回记录', async () => {
    const ctx = {
      localTime: '2026-09-04T19:30:00+10:00',
      timeZone: 'Australia/Sydney',
      defaultCurrency: 'AUD',
    };
    const out = await structure('早餐25', ctx);
    expect(groqStructure).toHaveBeenCalledWith('早餐25', ctx);
    expect(out[0].amount).toBe(25);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ai/__tests__/index.test.ts`
Expected: FAIL，无法解析 `@/lib/ai`

- [ ] **Step 3: 实现**

`src/lib/ai/index.ts`：

```ts
import { groqStructure } from '@/lib/ai/providers/groq';
import type { StructureContext } from '@/lib/ai/prompt';
import type { AiTransaction } from '@/lib/ai/schema';

export type { StructureContext } from '@/lib/ai/prompt';

/**
 * 业务层唯一入口。
 * 换 provider 时只改这里的一行 import 与 providers/ 下的实现，
 * 调用方无需知道用的是哪家（spec §10.3）。
 */
export function structure(
  text: string,
  ctx: StructureContext,
): Promise<AiTransaction[]> {
  return groqStructure(text, ctx);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ai/__tests__/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/index.ts src/lib/ai/__tests__/index.test.ts
git commit -m "feat(ai): 对业务层暴露 provider 无关的 structure 接口"
```

---

## Task 6: 事件类型

**Files:**
- Create: `src/lib/ledger/events.ts`
- Test: `src/lib/ledger/__tests__/events.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/lib/ai/schema`
- Produces:
  - `type LedgerEvent`（判别字段为 **`kind`**，避免与 `Transaction.type` 混淆）
  - `SCHEMA_VERSION = 1`
  - `getDeviceId(): string`
  - `createTransactionCreated(tx: Transaction): LedgerEvent`
  - `createTransactionAmended(id: string, changes: Partial<Omit<Transaction,'id'>>): LedgerEvent`
  - `createTransactionDeleted(id: string): LedgerEvent`

- [ ] **Step 1: 写失败的测试**

`src/lib/ledger/__tests__/events.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHEMA_VERSION,
  getDeviceId,
  createTransactionCreated,
  createTransactionDeleted,
} from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
};

beforeEach(() => localStorage.clear());

describe('getDeviceId', () => {
  it('首次生成后保持稳定', () => {
    const a = getDeviceId();
    expect(a).toBeTruthy();
    expect(getDeviceId()).toBe(a);
  });
});

describe('事件构造', () => {
  it('created 事件带齐公共字段', () => {
    const e = createTransactionCreated(tx);
    expect(e.kind).toBe('transaction_created');
    expect(e.schemaVersion).toBe(SCHEMA_VERSION);
    expect(e.eventId).toMatch(/[0-9a-f-]{36}/);
    expect(e.deviceId).toBe(getDeviceId());
    expect(new Date(e.createdAt).toString()).not.toBe('Invalid Date');
    expect(e.payload).toEqual(tx);
  });

  it('每个事件的 eventId 唯一', () => {
    expect(createTransactionCreated(tx).eventId).not.toBe(
      createTransactionCreated(tx).eventId,
    );
  });

  it('deleted 事件只携带 id', () => {
    const e = createTransactionDeleted('tx1');
    expect(e.kind).toBe('transaction_deleted');
    expect(e.payload).toEqual({ id: 'tx1' });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ledger/__tests__/events.test.ts`
Expected: FAIL，无法解析 `@/lib/ledger/events`

- [ ] **Step 3: 实现**

`src/lib/ledger/events.ts`：

```ts
import type { Transaction } from '@/lib/ai/schema';

export const SCHEMA_VERSION = 1 as const;

const DEVICE_ID_KEY = 'justsayit.deviceId';

/**
 * 设备标识。每台设备在 Drive 上写自己独立的日志文件（spec §7），
 * 这是"设备间永不写同一文件、因而无写冲突"的基础。
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

type BaseEvent = {
  eventId: string;
  deviceId: string;
  /** 事件写入时刻。注意：统计口径用 Transaction.date，不用这个字段（§6.4） */
  createdAt: string;
  schemaVersion: typeof SCHEMA_VERSION;
};

/** 判别字段用 kind 而非 type——Transaction 已经占用了 type 表示收支方向 */
export type LedgerEvent =
  | (BaseEvent & { kind: 'transaction_created'; payload: Transaction })
  | (BaseEvent & {
      kind: 'transaction_amended';
      payload: { id: string; changes: Partial<Omit<Transaction, 'id'>> };
    })
  | (BaseEvent & { kind: 'transaction_deleted'; payload: { id: string } });

function base(): BaseEvent {
  return {
    eventId: crypto.randomUUID(),
    deviceId: getDeviceId(),
    createdAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
}

export function createTransactionCreated(tx: Transaction): LedgerEvent {
  return { ...base(), kind: 'transaction_created', payload: tx };
}

export function createTransactionAmended(
  id: string,
  changes: Partial<Omit<Transaction, 'id'>>,
): LedgerEvent {
  return { ...base(), kind: 'transaction_amended', payload: { id, changes } };
}

export function createTransactionDeleted(id: string): LedgerEvent {
  return { ...base(), kind: 'transaction_deleted', payload: { id } };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ledger/__tests__/events.test.ts`
Expected: PASS，4 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/events.ts src/lib/ledger/__tests__/events.test.ts
git commit -m "feat(ledger): 事件类型定义与构造函数"
```

---

## Task 7: 事件重放

**Files:**
- Create: `src/lib/ledger/replay.ts`
- Test: `src/lib/ledger/__tests__/replay.test.ts`

**Interfaces:**
- Consumes: `LedgerEvent` from `@/lib/ledger/events`；`Transaction` from `@/lib/ai/schema`
- Produces:
  - `type Ledger = { transactions: Transaction[] }`（按 `date` 降序、同日按事件顺序）
  - `replay(events: LedgerEvent[]): Ledger`

- [ ] **Step 1: 写失败的测试**

`src/lib/ledger/__tests__/replay.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { replay } from '@/lib/ledger/replay';
import type { LedgerEvent } from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

let seq = 0;
const evt = (kind: LedgerEvent['kind'], payload: unknown): LedgerEvent =>
  ({
    eventId: `e${seq++}`,
    deviceId: 'dev',
    createdAt: '2026-09-04T10:00:00+10:00',
    schemaVersion: 1,
    kind,
    payload,
  }) as LedgerEvent;

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
  ...over,
});

describe('replay', () => {
  it('空事件序列产生空账本', () => {
    expect(replay([]).transactions).toEqual([]);
  });

  it('created 事件产生账目', () => {
    const l = replay([evt('transaction_created', tx('a'))]);
    expect(l.transactions).toHaveLength(1);
    expect(l.transactions[0].id).toBe('a');
  });

  it('amended 事件覆盖指定字段，其余不变', () => {
    const l = replay([
      evt('transaction_created', tx('a')),
      evt('transaction_amended', { id: 'a', changes: { category: 'DAILY' } }),
    ]);
    expect(l.transactions[0].category).toBe('DAILY');
    expect(l.transactions[0].amountCents).toBe(2500);
  });

  it('deleted 事件移除账目', () => {
    const l = replay([
      evt('transaction_created', tx('a')),
      evt('transaction_created', tx('b')),
      evt('transaction_deleted', { id: 'a' }),
    ]);
    expect(l.transactions.map((t) => t.id)).toEqual(['b']);
  });

  it('忽略指向不存在账目的 amended/deleted（同步合并时可能先到）', () => {
    expect(() =>
      replay([evt('transaction_amended', { id: 'ghost', changes: { category: 'OTHER' } })]),
    ).not.toThrow();
    expect(replay([evt('transaction_deleted', { id: 'ghost' })]).transactions).toEqual([]);
  });

  it('按日期降序排列，最近的在前', () => {
    const l = replay([
      evt('transaction_created', tx('old', { date: '2026-09-01' })),
      evt('transaction_created', tx('new', { date: '2026-09-04' })),
      evt('transaction_created', tx('mid', { date: '2026-09-02' })),
    ]);
    expect(l.transactions.map((t) => t.id)).toEqual(['new', 'mid', 'old']);
  });

  it('相同输入产生等值结果（重放是纯函数）', () => {
    const events = [evt('transaction_created', tx('a'))];
    expect(replay(events)).toEqual(replay(events));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ledger/__tests__/replay.test.ts`
Expected: FAIL，无法解析 `@/lib/ledger/replay`

- [ ] **Step 3: 实现**

`src/lib/ledger/replay.ts`：

```ts
import type { LedgerEvent } from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

export type Ledger = {
  transactions: Transaction[];
};

/**
 * 事件序列 → 账本状态。纯函数，无副作用。
 *
 * 对不存在的账目做 amend/delete 时静默忽略：多设备同步合并后，
 * 事件顺序不保证与因果一致（§7），抛错会让整个重放失败。
 */
export function replay(events: LedgerEvent[]): Ledger {
  // 用 Map 自身的插入顺序语义代替手动维护的 order 数组：
  // 对已存在的 key 调用 set 不会改变其位置；先 delete 再 set 则视为全新插入、
  // 排到末尾——这正是「先删除、同 id 再新建」时应有的语义，且不会产生重复条目
  // （手动维护 order 数组曾在此处漏删已删除 id，导致重建后账目重复出现两次）。
  const byId = new Map<string, Transaction>();

  for (const e of events) {
    switch (e.kind) {
      case 'transaction_created': {
        byId.set(e.payload.id, e.payload);
        break;
      }
      case 'transaction_amended': {
        const cur = byId.get(e.payload.id);
        if (cur) byId.set(e.payload.id, { ...cur, ...e.payload.changes });
        break;
      }
      case 'transaction_deleted': {
        byId.delete(e.payload.id);
        break;
      }
    }
  }

  const transactions = [...byId.values()]
    // 日期降序；同日保持事件写入顺序，使刚记的账出现在当日组内靠后位置
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return { transactions };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ledger/__tests__/replay.test.ts`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/replay.ts src/lib/ledger/__tests__/replay.test.ts
git commit -m "feat(ledger): 事件重放为账本状态"
```

---

## Task 8: merchant 归一化

**Files:**
- Create: `src/lib/ledger/normalize.ts`
- Test: `src/lib/ledger/__tests__/normalize.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `normalizeMerchant(input: string | null, known: string[]): string | null`

**背景（spec §5.3 规则四）**：同一商户会得到不同写法（`McDonald's` / `麦当劳`），`merchant` 是开放集合无法用枚举约束。用该用户历史出现过的写法做归并。

- [ ] **Step 1: 写失败的测试**

`src/lib/ledger/__tests__/normalize.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { normalizeMerchant } from '@/lib/ledger/normalize';

describe('normalizeMerchant', () => {
  it('null 原样返回', () => {
    expect(normalizeMerchant(null, ['Woolworths'])).toBeNull();
  });

  it('历史为空时保留原值', () => {
    expect(normalizeMerchant('Woolworths', [])).toBe('Woolworths');
  });

  it('完全一致时返回历史写法', () => {
    expect(normalizeMerchant('Woolworths', ['Woolworths'])).toBe('Woolworths');
  });

  it('忽略大小写与空格差异，归并到历史写法', () => {
    expect(normalizeMerchant('woolworths', ['Woolworths'])).toBe('Woolworths');
    expect(normalizeMerchant('Uber  Eats', ['Uber Eats'])).toBe('Uber Eats');
  });

  it('轻微拼写差异归并到历史写法（STT 错拼的主要形态）', () => {
    expect(normalizeMerchant('Woolworth', ['Woolworths'])).toBe('Woolworths');
    expect(normalizeMerchant('woworths', ['Woolworths'])).toBe('Woolworths');
  });

  it('差异过大时保留原值，不强行归并', () => {
    expect(normalizeMerchant('Coles', ['Woolworths'])).toBe('Coles');
    expect(normalizeMerchant('麦当劳', ['Woolworths'])).toBe('麦当劳');
  });

  it('多个候选时取最接近的', () => {
    expect(normalizeMerchant('Colse', ['Woolworths', 'Coles', 'Aldi'])).toBe('Coles');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ledger/__tests__/normalize.test.ts`
Expected: FAIL，无法解析 `@/lib/ledger/normalize`

- [ ] **Step 3: 实现**

`src/lib/ledger/normalize.ts`：

```ts
/** 比较用的规范形式：去空格、转小写 */
function canon(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/**
 * 编辑距离（Damerau-Levenshtein 的受限变体，即 optimal string alignment）：
 * 在插入/删除/替换之外，把相邻两字符互换算作一次操作。
 * STT 与打字最常见的错拼正是相邻换位（如 Colse/Coles），
 * 用普通 Levenshtein 距离会把它算成 2（两次替换），导致漏并——
 * 加这一项操作正是为了让这类典型错拼落在阈值内。
 */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prevPrev = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = cur;
    cur = new Array<number>(b.length + 1);
  }
  return prev[b.length];
}

/**
 * 把新出现的 merchant 归并到该用户历史用过的写法上。
 *
 * 阈值取长度的 30%（至少 1）：既能吸收 STT 的轻微错拼（woworths → Woolworths），
 * 又不会把 Coles 误并到 Woolworths。宁可漏并，不可错并——错并会静默污染
 * 历史数据，而漏并只是多一个待归并的写法。
 */
export function normalizeMerchant(input: string | null, known: string[]): string | null {
  if (input === null) return null;
  const target = canon(input);
  if (!target) return input;

  let best: { value: string; d: number } | null = null;
  for (const k of known) {
    const d = distance(target, canon(k));
    if (best === null || d < best.d) best = { value: k, d };
  }
  if (best === null) return input;

  const threshold = Math.max(1, Math.floor(target.length * 0.3));
  return best.d <= threshold ? best.value : input;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ledger/__tests__/normalize.test.ts`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/normalize.ts src/lib/ledger/__tests__/normalize.test.ts
git commit -m "feat(ledger): merchant 归一化"
```

---

## Task 9: IndexedDB 事件存储

**Files:**
- Create: `src/lib/ledger/db.ts`
- Test: `src/lib/ledger/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `LedgerEvent` from `@/lib/ledger/events`
- Produces:
  - `appendEvents(events: LedgerEvent[]): Promise<void>`
  - `readAllEvents(): Promise<LedgerEvent[]>`
  - `clearAllEvents(): Promise<void>`（仅测试与"退出登录清本地"使用）

**注意**：只有追加与全量读两个操作——事件日志模型把存储需求压缩到这个程度，因此不需要索引、不需要查询层（spec §6.1）。

- [ ] **Step 1: 写失败的测试**

`src/lib/ledger/__tests__/db.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { appendEvents, readAllEvents, clearAllEvents } from '@/lib/ledger/db';
import type { LedgerEvent } from '@/lib/ledger/events';

const evt = (id: string): LedgerEvent => ({
  eventId: id,
  deviceId: 'dev',
  createdAt: '2026-09-04T10:00:00+10:00',
  schemaVersion: 1,
  kind: 'transaction_created',
  payload: {
    id: `tx-${id}`,
    type: 'EXPENSE',
    amountCents: 2500,
    currency: 'AUD',
    date: '2026-09-04',
    category: 'FOOD',
    merchant: null,
    description: '早餐',
  },
});

beforeEach(async () => {
  await clearAllEvents();
});

describe('事件存储', () => {
  it('空库读出空数组', async () => {
    expect(await readAllEvents()).toEqual([]);
  });

  it('追加后能读回', async () => {
    await appendEvents([evt('a')]);
    const all = await readAllEvents();
    expect(all).toHaveLength(1);
    expect(all[0].eventId).toBe('a');
  });

  it('保持写入顺序', async () => {
    await appendEvents([evt('a'), evt('b')]);
    await appendEvents([evt('c')]);
    expect((await readAllEvents()).map((e) => e.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('同一 eventId 重复写入不产生重复记录（同步去重的基础）', async () => {
    await appendEvents([evt('a')]);
    await appendEvents([evt('a')]);
    expect(await readAllEvents()).toHaveLength(1);
  });

  it('空数组不报错', async () => {
    await expect(appendEvents([])).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ledger/__tests__/db.test.ts`
Expected: FAIL，无法解析 `@/lib/ledger/db`

- [ ] **Step 3: 实现**

`src/lib/ledger/db.ts`：

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { LedgerEvent } from '@/lib/ledger/events';

const DB_NAME = 'justsayit';
const DB_VERSION = 1;
const STORE = 'events';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          // eventId 作为主键 —— 重复写入同一事件时自动覆盖，
          // 这正是多设备日志合并去重所需要的语义（§7）
          database.createObjectStore(STORE, { keyPath: 'eventId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function appendEvents(events: LedgerEvent[]): Promise<void> {
  if (events.length === 0) return;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  for (const e of events) tx.store.put(e);
  await tx.done;
}

export async function readAllEvents(): Promise<LedgerEvent[]> {
  const d = await db();
  return (await d.getAll(STORE)) as LedgerEvent[];
}

export async function clearAllEvents(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ledger/__tests__/db.test.ts`
Expected: PASS，5 个测试全绿

> 若"保持写入顺序"一项失败：`getAll` 按主键顺序返回，而 `eventId` 是随机 UUID。此时改为在 store 上使用自增序号作为主键、`eventId` 建唯一索引。测试已覆盖该行为，按测试为准调整实现。

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/db.ts src/lib/ledger/__tests__/db.test.ts
git commit -m "feat(ledger): IndexedDB 事件存储"
```

---

## Task 10: 内存 store

**Files:**
- Create: `src/lib/ledger/store.ts`
- Test: `src/lib/ledger/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `appendEvents`/`readAllEvents` from `@/lib/ledger/db`；`replay`/`Ledger` from `@/lib/ledger/replay`；事件构造函数 from `@/lib/ledger/events`
- Produces:
  - `subscribe(fn: () => void): () => void`
  - `getSnapshot(): Ledger`
  - `hydrate(): Promise<void>`（从 IndexedDB 载入并重放）
  - `addTransactions(txs: Transaction[]): Promise<void>`
  - `removeTransaction(id: string): Promise<void>`
  - `knownMerchants(): string[]`

- [ ] **Step 1: 写失败的测试**

`src/lib/ledger/__tests__/store.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { clearAllEvents } from '@/lib/ledger/db';
import {
  subscribe,
  getSnapshot,
  hydrate,
  addTransactions,
  removeTransaction,
  knownMerchants,
} from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
  ...over,
});

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

describe('store', () => {
  it('初始为空账本', () => {
    expect(getSnapshot().transactions).toEqual([]);
  });

  it('getSnapshot 在无变更时返回同一引用（useSyncExternalStore 的硬性要求）', () => {
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it('addTransactions 后引用更换且内容更新', async () => {
    const before = getSnapshot();
    await addTransactions([tx('a')]);
    const after = getSnapshot();
    expect(after).not.toBe(before);
    expect(after.transactions).toHaveLength(1);
  });

  it('变更时通知订阅者', async () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    await addTransactions([tx('a')]);
    expect(calls).toBe(1);
    off();
    await addTransactions([tx('b')]);
    expect(calls).toBe(1);
  });

  it('变更已持久化——重新 hydrate 后仍在', async () => {
    await addTransactions([tx('a')]);
    await hydrate();
    expect(getSnapshot().transactions.map((t) => t.id)).toEqual(['a']);
  });

  it('removeTransaction 移除账目', async () => {
    await addTransactions([tx('a'), tx('b')]);
    await removeTransaction('a');
    expect(getSnapshot().transactions.map((t) => t.id)).toEqual(['b']);
  });

  it('knownMerchants 去重返回历史商户名', async () => {
    await addTransactions([
      tx('a', { merchant: 'Woolworths' }),
      tx('b', { merchant: 'Woolworths' }),
      tx('c', { merchant: null }),
      tx('d', { merchant: 'Coles' }),
    ]);
    expect(knownMerchants().sort()).toEqual(['Coles', 'Woolworths']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/ledger/__tests__/store.test.ts`
Expected: FAIL，无法解析 `@/lib/ledger/store`

- [ ] **Step 3: 实现**

`src/lib/ledger/store.ts`：

```ts
import { appendEvents, readAllEvents } from '@/lib/ledger/db';
import { replay, type Ledger } from '@/lib/ledger/replay';
import {
  createTransactionCreated,
  createTransactionDeleted,
  type LedgerEvent,
} from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

const EMPTY: Ledger = { transactions: [] };

let events: LedgerEvent[] = [];
let ledger: Ledger = EMPTY;
const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 必须始终返回同一引用直到状态真正改变。
 * 切勿在此做筛选或映射——每次返回新数组会让 React 判定状态持续变化，
 * 进入无限重渲染（spec §6.6）。派生一律在组件里用 useMemo。
 */
export function getSnapshot(): Ledger {
  return ledger;
}

function commit(): void {
  ledger = replay(events);
  for (const fn of listeners) fn();
}

/** 从 IndexedDB 载入全部事件并重放。应用启动时调用一次。 */
export async function hydrate(): Promise<void> {
  events = await readAllEvents();
  commit();
}

async function push(newEvents: LedgerEvent[]): Promise<void> {
  if (newEvents.length === 0) return;
  await appendEvents(newEvents);
  events = [...events, ...newEvents];
  commit();
}

export async function addTransactions(txs: Transaction[]): Promise<void> {
  await push(txs.map(createTransactionCreated));
}

export async function removeTransaction(id: string): Promise<void> {
  await push([createTransactionDeleted(id)]);
}

/** 该用户历史出现过的商户名，供归一化与（Plan 2）STT 偏置词表使用 */
export function knownMerchants(): string[] {
  const set = new Set<string>();
  for (const t of ledger.transactions) if (t.merchant) set.add(t.merchant);
  return [...set];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/ledger/__tests__/store.test.ts`
Expected: PASS，7 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/ledger/store.ts src/lib/ledger/__tests__/store.test.ts
git commit -m "feat(ledger): 内存 store 与订阅机制"
```

---

## Task 11: /api/structure 端点

**Files:**
- Create: `src/app/api/structure/route.ts`
- Test: `src/app/api/structure/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `structure` from `@/lib/ai`
- Produces: `POST /api/structure`
  - 请求体：`{ text: string, localTime: string, timeZone: string, defaultCurrency: string }`
  - 200：`{ records: AiTransaction[] }`
  - 400：入参不合法
  - 403：非 development 且未开启 `ALLOW_UNAUTHENTICATED_API`
  - 502：上游失败

**安全说明**：本端点在 Plan 1 中尚无鉴权（认证在 Plan 2）。非 development 环境默认 403，防止误部署导致接口裸奔。

- [ ] **Step 1: 写失败的测试**

`src/app/api/structure/__tests__/route.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai', () => ({ structure: vi.fn() }));

import { POST } from '@/app/api/structure/route';
import { structure } from '@/lib/ai';

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

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.mocked(structure).mockReset();
});

afterEach(() => {
  vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test');
  vi.unstubAllEnvs();
});

describe('POST /api/structure', () => {
  it('返回抽取结果', async () => {
    vi.mocked(structure).mockResolvedValue([
      {
        type: 'EXPENSE',
        amount: 25,
        currency: null,
        date: '2026-09-04',
        category: 'FOOD',
        merchant: '麦当劳',
        description: '早餐',
      },
    ]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect((await res.json()).records).toHaveLength(1);
  });

  it('缺字段返回 400', async () => {
    const res = await POST(req({ text: '早餐25' }));
    expect(res.status).toBe(400);
  });

  it('text 为空字符串返回 400', async () => {
    const res = await POST(req({ ...body, text: '   ' }));
    expect(res.status).toBe(400);
  });

  it('非 development 且未显式放行时返回 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_UNAUTHENTICATED_API', 'false');
    const res = await POST(req(body));
    expect(res.status).toBe(403);
    expect(structure).not.toHaveBeenCalled();
  });

  it('上游失败返回 502，且响应体不含用户输入', async () => {
    vi.mocked(structure).mockRejectedValue(new Error('Groq 请求失败：HTTP 429'));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('早餐麦当劳');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/app/api/structure/__tests__/route.test.ts`
Expected: FAIL，无法解析 `@/app/api/structure/route`

- [ ] **Step 3: 实现**

`src/app/api/structure/route.ts`：

```ts
import { z } from 'zod';
import { structure } from '@/lib/ai';

const RequestSchema = z.object({
  text: z.string().trim().min(1),
  localTime: z.string().min(1),
  timeZone: z.string().min(1),
  defaultCurrency: z.string().length(3),
});

function accessAllowed(): boolean {
  // Plan 2 接入认证后移除此开关，改为校验 session
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.ALLOW_UNAUTHENTICATED_API === 'true';
}

export async function POST(request: Request): Promise<Response> {
  if (!accessAllowed()) {
    return Response.json({ error: '未启用' }, { status: 403 });
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

  const { text, ...ctx } = parsed.data;
  const started = Date.now();
  try {
    const records = await structure(text, ctx);
    // 零内容日志（§10.5）：只记元数据，永不记 prompt 与 response 内容
    console.info(
      JSON.stringify({ route: 'structure', ok: true, ms: Date.now() - started, count: records.length }),
    );
    return Response.json({ records });
  } catch (err) {
    console.error(
      JSON.stringify({
        route: 'structure',
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json({ error: '结构化失败，请重试' }, { status: 502 });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/app/api/structure/__tests__/route.test.ts`
Expected: PASS，5 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/app/api/structure/route.ts src/app/api/structure/__tests__/route.test.ts
git commit -m "feat(api): /api/structure 代理端点"
```

---

## Task 12: 账目行与列表组件

**Files:**
- Create: `src/components/TransactionRow.tsx`, `src/components/LedgerList.tsx`
- Test: `src/components/__tests__/LedgerList.test.tsx`

**Interfaces:**
- Consumes: `Transaction` from `@/lib/ai/schema`
- Produces:
  - `<TransactionRow transaction={tx} />`
  - `<LedgerList transactions={txs} />`
  - `formatAmount(cents: number, currency: string): string`（自 `TransactionRow` 导出）

**注意**：`TransactionRow` 将被 Plan 4 的统计明细复用（spec §13.2），因此不得包含任何"我在主屏"的假设。

- [ ] **Step 1: 写失败的测试**

`src/components/__tests__/LedgerList.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LedgerList } from '@/components/LedgerList';
import { formatAmount } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
  ...over,
});

describe('formatAmount', () => {
  it('整数分渲染为两位小数', () => {
    expect(formatAmount(5430, 'AUD')).toBe('54.30');
    expect(formatAmount(1, 'AUD')).toBe('0.01');
    expect(formatAmount(240000, 'AUD')).toBe('2400.00');
  });
});

describe('LedgerList', () => {
  it('空列表给出提示而非空白', () => {
    render(<LedgerList transactions={[]} />);
    expect(screen.getByText(/还没有记录/)).toBeDefined();
  });

  it('渲染商户与描述', () => {
    render(<LedgerList transactions={[tx('a', { merchant: 'Woolworths', description: '买菜' })]} />);
    expect(screen.getByText('Woolworths')).toBeDefined();
    expect(screen.getByText('买菜')).toBeDefined();
  });

  it('支出显示负号，收入显示正号', () => {
    render(
      <LedgerList
        transactions={[
          tx('a', { amountCents: 2500 }),
          tx('b', { type: 'INCOME', category: 'SALARY', amountCents: 500000 }),
        ]}
      />,
    );
    expect(screen.getByText('-25.00')).toBeDefined();
    expect(screen.getByText('+5000.00')).toBeDefined();
  });

  it('按日期分组，每个日期只出现一个标题', () => {
    render(
      <LedgerList
        transactions={[
          tx('a', { date: '2026-09-04' }),
          tx('b', { date: '2026-09-04' }),
          tx('c', { date: '2026-09-03' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/__tests__/LedgerList.test.tsx`
Expected: FAIL，无法解析 `@/components/LedgerList`

- [ ] **Step 3: 实现**

`src/components/TransactionRow.tsx`：

```tsx
import type { Transaction } from '@/lib/ai/schema';

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const sign = transaction.type === 'INCOME' ? '+' : '-';
  return (
    <li>
      <span>{transaction.merchant ?? '—'}</span>
      <span>{transaction.description}</span>
      <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
    </li>
  );
}
```

`src/components/LedgerList.tsx`：

```tsx
import { TransactionRow } from '@/components/TransactionRow';
import type { Transaction } from '@/lib/ai/schema';

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = groups.get(t.date);
    if (list) list.push(t);
    else groups.set(t.date, [t]);
  }
  return [...groups.entries()];
}

export function LedgerList({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return <p>还没有记录，说点什么试试。</p>;
  }
  return (
    <div>
      {groupByDate(transactions).map(([date, items]) => (
        <section key={date}>
          <h2>{date}</h2>
          <ul>
            {items.map((t) => (
              <TransactionRow key={t.id} transaction={t} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/__tests__/LedgerList.test.tsx`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/components/TransactionRow.tsx src/components/LedgerList.tsx src/components/__tests__/LedgerList.test.tsx
git commit -m "feat(ui): 账目行与按日分组列表"
```

---

## Task 13: 输入区与提交流程

**Files:**
- Create: `src/components/Composer.tsx`
- Test: `src/components/__tests__/Composer.test.tsx`

**Interfaces:**
- Consumes: 无（提交行为由 prop 注入，便于测试）
- Produces: `<Composer onSubmit={(text: string) => Promise<void>} />`

- [ ] **Step 1: 写失败的测试**

`src/components/__tests__/Composer.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Composer } from '@/components/Composer';

describe('Composer', () => {
  it('提交后把文本交给 onSubmit 并清空输入框', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    expect(onSubmit).toHaveBeenCalledWith('早餐麦当劳25');
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''));
  });

  it('空输入时提交按钮禁用', () => {
    render(<Composer onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '提交' })).toHaveProperty('disabled', true);
  });

  it('提交进行中禁用按钮并显示提交中（防重复提交，§9）', async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const onSubmit = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<Composer onSubmit={onSubmit} />);

    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    const btn = await screen.findByRole('button', { name: '提交中…' });
    expect(btn).toHaveProperty('disabled', true);

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '提交' })).toBeDefined());
  });

  it('提交失败时保留输入内容供用户重试', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    render(<Composer onSubmit={onSubmit} />);

    const box = screen.getByRole('textbox');
    await user.type(box, '早餐25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect((box as HTMLTextAreaElement).value).toBe('早餐25');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/components/__tests__/Composer.test.tsx`
Expected: FAIL，无法解析 `@/components/Composer`

- [ ] **Step 3: 实现**

`src/components/Composer.tsx`：

```tsx
'use client';

import { useState } from 'react';

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      setText(''); // 仅在成功后清空——失败时保留内容供重试
    } catch {
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
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/components/__tests__/Composer.test.tsx`
Expected: PASS，4 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/components/Composer.tsx src/components/__tests__/Composer.test.tsx
git commit -m "feat(ui): 输入区与防重复提交"
```

---

## Task 14: 主屏组装与端到端验收

**Files:**
- Create: `src/lib/ledger/useLedger.ts`, `src/app/page.tsx`（覆盖 Task 1 的占位）
- Test: `src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: store、`Composer`、`LedgerList`、`normalizeMerchant`、`toTransaction`
- Produces: `useLedger(): Ledger`；可运行的主屏

- [ ] **Step 1: 写失败的测试**

`src/app/__tests__/page.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('主屏', () => {
  it('提交后账目出现在列表中', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
              date: '2026-09-04',
              category: 'FOOD',
              merchant: '麦当劳',
              description: '早餐',
            },
          ],
        }),
      }),
    );

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.getByText('-25.00')).toBeDefined();
  });

  it('后端返回空数组时不新增账目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '今天天气不错');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByText(/还没有记录/)).toBeDefined());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/app/__tests__/page.test.tsx`
Expected: FAIL，`useLedger` 不存在

- [ ] **Step 3: 实现**

`src/lib/ledger/useLedger.ts`：

```ts
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, hydrate } from '@/lib/ledger/store';
import type { Ledger } from '@/lib/ledger/replay';

const EMPTY: Ledger = { transactions: [] };

export function useLedger(): Ledger {
  useEffect(() => {
    void hydrate();
  }, []);
  // 服务端渲染时返回稳定的空账本，避免 hydration 不匹配
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
```

`src/app/page.tsx`（覆盖 Task 1 的占位内容）：

```tsx
'use client';

import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { useLedger } from '@/lib/ledger/useLedger';
import { addTransactions, knownMerchants } from '@/lib/ledger/store';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { toTransaction, type AiTransaction } from '@/lib/ai/schema';

const DEFAULT_CURRENCY = 'AUD';

export default function Home() {
  const ledger = useLedger();
  // getSnapshot 返回缓存引用，ledger.transactions 本身即稳定，直接读即可。
  // §6.6 的 useMemo 规则针对的是真正的派生（筛选/排序/分组），Plan 1 尚无此类。
  const transactions = ledger.transactions;

  async function handleSubmit(text: string) {
    const res = await fetch('/api/structure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        localTime: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultCurrency: DEFAULT_CURRENCY,
      }),
    });
    if (!res.ok) throw new Error('结构化失败');

    const { records } = (await res.json()) as { records: AiTransaction[] };
    const known = knownMerchants();
    const txs = records.map((r) =>
      toTransaction(
        { ...r, merchant: normalizeMerchant(r.merchant, known) },
        { id: crypto.randomUUID(), defaultCurrency: DEFAULT_CURRENCY },
      ),
    );
    await addTransactions(txs);
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      <LedgerList transactions={transactions} />
      <Composer onSubmit={handleSubmit} />
    </main>
  );
}
```

- [ ] **Step 4: 运行全部测试与类型检查**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS，tsc 无错误

- [ ] **Step 5: 手工端到端验收（由用户执行，执行代理不做）**

> **执行代理注意**：本步骤需要真实 `GROQ_API_KEY`、真实浏览器与人工判读，**不属于代理工作范围**。代理只需确认 `npm test` 与 `npm run typecheck` 通过，然后把下面这份清单原样交给用户，由用户自行验收。不要尝试启动 dev server、不要用浏览器工具代跑、不要因为无法验收而阻塞后续任务。

```bash
cp .env.example .env.local   # 填入真实 GROQ_API_KEY
npm run dev
```

在浏览器打开 `http://localhost:3000`，逐项确认：

1. 输入 `今天早上吃麦当劳花了25块，中午和同事一起吃越南粉15块` → 出现 **2 笔**，金额 25.00 与 15.00，分类均为餐饮
2. 输入 `Woolworths 买菜五十四块三` → 金额 **54.30**（口语数字转换正确）
3. 输入 `昨天买了杯咖啡，7.5刀` → 日期为**昨天**（相对日期解析正确）
4. 输入 `今天工资到账5000` → 显示 **+5000.00**（收入为正号）
5. 输入 `今天天气不错` → **不新增任何记录**
6. 刷新页面 → 上述记录**仍在**（IndexedDB 持久化生效）
7. 连续快速点击提交 → 按钮变为"提交中…"且不可重复触发

> 第 8 项（乐观占位行与撤销）在 Task 15 完成后一并验收。

- [ ] **Step 6: 验证 provider 隔离判据**

Run: `grep -rl "groq" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: 至多两个文件——`src/lib/ai/index.ts`（**仅** import 语句提及）与 `src/lib/ai/providers/groq.ts`。Task 5 之前只有后者。

Run: `grep -rlE "qwen|api\.groq\.com|reasoning_effort|json_schema" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__`
Expected: 只输出 `src/lib/ai/providers/groq.ts`。**这一条才是真正的隔离判据**——provider 的具体取值（模型 ID、端点、私有参数）只能存在于一个文件；窄接口按名字引用 provider 是接缝本身，不是泄漏。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 打通核心记账闭环"
```

---

## Task 15: 乐观 UI 与撤销

**Files:**
- Create: `src/components/PendingRow.tsx`, `src/components/UndoToast.tsx`
- Modify: `src/app/page.tsx`（提交流程改为乐观插入）
- Test: `src/app/__tests__/optimistic.test.tsx`

**Interfaces:**
- Consumes: `removeTransaction` from `@/lib/ledger/store`
- Produces: `<PendingRow text={string} />`、`<UndoToast count={number} onUndo={() => void} onDismiss={() => void} />`

**背景（spec §9、§16.5）**：spec 明确要求"提交瞬间即插入占位行，不可让用户等待 spinner"，并在结果落地后给出"已记录 N 笔 · 撤销"，数秒后淡出。Task 13/14 的实现是等接口返回后才插入，属于 spinner 等待，不符合该要求。

- [ ] **Step 1: 写失败的测试**

`src/app/__tests__/optimistic.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

const oneRecord = {
  type: 'EXPENSE',
  amount: 25,
  currency: null,
  date: '2026-09-04',
  category: 'FOOD',
  merchant: '麦当劳',
  description: '早餐',
};

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('乐观 UI', () => {
  it('提交瞬间出现占位行，不等待接口返回', async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((r) => (release = r))),
    );

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    // 接口尚未返回，占位行已经在了
    expect(await screen.findByText('早餐麦当劳25')).toBeDefined();
    expect(screen.getByText(/处理中/)).toBeDefined();

    release({ ok: true, json: async () => ({ records: [oneRecord] }) });
    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.queryByText(/处理中/)).toBeNull();
  });

  it('结果落地后显示已记录 N 笔与撤销按钮', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    expect(await screen.findByText(/已记录 1 笔/)).toBeDefined();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDefined();
  });

  it('点击撤销移除刚记的账目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await screen.findByText('麦当劳');
    await user.click(screen.getByRole('button', { name: '撤销' }));

    await waitFor(() => expect(screen.queryByText('麦当劳')).toBeNull());
    expect(screen.getByText(/还没有记录/)).toBeDefined();
  });

  it('失败时占位行消失且输入内容保留', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const user = userEvent.setup();
    render(<Home />);
    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.queryByText(/处理中/)).toBeNull());
    expect((box as HTMLTextAreaElement).value).toBe('早餐麦当劳25');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/app/__tests__/optimistic.test.tsx`
Expected: FAIL——占位行与撤销尚未实现

- [ ] **Step 3: 写占位行与撤销条组件**

`src/components/PendingRow.tsx`：

```tsx
export function PendingRow({ text }: { text: string }) {
  return (
    <li aria-live="polite">
      <span>{text}</span>
      <span>处理中…</span>
    </li>
  );
}
```

`src/components/UndoToast.tsx`：

```tsx
'use client';

import { useEffect } from 'react';

const AUTO_DISMISS_MS = 6000;

export function UndoToast({
  count,
  onUndo,
  onDismiss,
}: {
  count: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div role="status">
      <span>{`已记录 ${count} 笔`}</span>
      <button type="button" onClick={onUndo}>
        撤销
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 改造主屏提交流程**

`src/app/page.tsx` 整体替换为：

```tsx
'use client';

import { useState, useCallback } from 'react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { UndoToast } from '@/components/UndoToast';
import { useLedger } from '@/lib/ledger/useLedger';
import { addTransactions, removeTransaction, knownMerchants } from '@/lib/ledger/store';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { toTransaction, type AiTransaction } from '@/lib/ai/schema';

const DEFAULT_CURRENCY = 'AUD';

export default function Home() {
  const ledger = useLedger();
  const transactions = ledger.transactions;   // 稳定引用，无需 memo（见 Task 14）

  const [pending, setPending] = useState<string[]>([]);
  const [lastAdded, setLastAdded] = useState<string[]>([]);

  const clearToast = useCallback(() => setLastAdded([]), []);

  const undo = useCallback(async () => {
    for (const id of lastAdded) await removeTransaction(id);
    setLastAdded([]);
  }, [lastAdded]);

  async function handleSubmit(text: string) {
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, text]);
    try {
      const res = await fetch('/api/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          localTime: new Date().toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          defaultCurrency: DEFAULT_CURRENCY,
        }),
      });
      if (!res.ok) throw new Error('结构化失败');

      const { records } = (await res.json()) as { records: AiTransaction[] };
      const known = knownMerchants();
      const txs = records.map((r) =>
        toTransaction(
          { ...r, merchant: normalizeMerchant(r.merchant, known) },
          { id: crypto.randomUUID(), defaultCurrency: DEFAULT_CURRENCY },
        ),
      );
      await addTransactions(txs);
      if (txs.length > 0) setLastAdded(txs.map((t) => t.id));
    } finally {
      setPending((p) => p.filter((t) => t !== text));
    }
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      {pending.length > 0 && (
        <ul>
          {pending.map((t, i) => (
            <PendingRow key={`${t}-${i}`} text={t} />
          ))}
        </ul>
      )}
      <LedgerList transactions={transactions} />
      {lastAdded.length > 0 && (
        <UndoToast count={lastAdded.length} onUndo={undo} onDismiss={clearToast} />
      )}
      <Composer onSubmit={handleSubmit} />
    </main>
  );
}
```

> 占位行在 `finally` 中清除：失败路径下 `Composer` 会捕获异常并保留输入内容，占位行必须同时消失，否则会留下一条永久"处理中"的幽灵行。

- [ ] **Step 5: 运行全部测试与类型检查**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS，tsc 无错误

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): 乐观插入占位行与撤销"
```

---

## 完成标准

Plan 1 完成时应满足：

- `npm test` 全绿，`npm run typecheck` 无错误
- provider 取值隔离判据通过：`grep -rlE "qwen|api\.groq\.com|reasoning_effort|json_schema" src/ --include='*.ts' --include='*.tsx' | grep -v __tests__` 只命中 `src/lib/ai/providers/groq.ts`
- 手工验收 7 项全部通过（**由用户执行**——视觉、真实 AI 调用、录音与文字输入的实际效果不在代理验证范围内）
- 金额在整个链路中以整数分存储，展示层才转两位小数
- 事件日志只追加，刷新后数据完好
- 提交瞬间出现占位行，用户不面对 spinner；结果落地后可一键撤销

## 交接给 Plan 2

Plan 2（认证与配额 + 语音输入）将基于以下产物：

- `structure(text, ctx)` 窄接口——Plan 2 在旁边加 `transcribe(audio, vocab)`，同样只在 `providers/groq.ts` 内实现
- `knownMerchants()`——Plan 2 用作 STT 的 `prompt` 偏置词表（spec §16.3）
- `/api/structure` 的 `accessAllowed()` 开关——Plan 2 接入 session 校验后**必须删除**
- `Composer` 的 `onSubmit` 契约——Plan 2 在其上增加录音按钮，转写结果回填输入框后仍走同一提交入口（spec §9）
