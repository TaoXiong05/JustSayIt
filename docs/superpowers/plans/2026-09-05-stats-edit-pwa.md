# 统计 + 账目编辑 + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 加上账目编辑（改分类/金额/日期/商户/描述、删除）、按周/月的分类统计视图，以及让应用可安装到主屏幕（Service Worker + manifest + 安装引导），完成 MVP 剩余的纯前端功能面。部署（Oracle VM/CI/CD）单列 Plan 5，不在本 Plan 范围内。

**Architecture:** 编辑经由**追加事件**表达（`transaction_amended`/`transaction_deleted`，Plan 1 已定义），不修改历史事件，保持 Plan 3 的同步模型不变。统计是对内存里已重放好的 `Ledger.transactions` 做一次 `reduce`，不引入任何新存储/索引层。行内展开编辑用同一个 `TransactionRow` 组件，主屏列表和统计页明细复用同一份实现。PWA 的 Service Worker 只缓存应用外壳，绝不碰账本数据或 `/api/*`——数据层的离线能力（IndexedDB + 离线队列）已经在 Plan 3 做完，SW 不重复这层职责。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5、Serwist（Service Worker，`next-pwa` 的 App Router 继任者）、Vitest + Testing Library。不引入日期/时区库——周/月边界用 `Intl.DateTimeFormat` 手算（数据量级和既有代码风格都不需要额外依赖）。

**Spec:** `docs/superpowers/specs/2026-09-04-justsayit-design.md`（本 Plan 覆盖 §6.3 附加要求、§6.4 统计视图、§6.5 账目编辑、§8.8 安装引导时机、§13.1 屏幕清单与导航、§13.2 编辑交互、§13.4 Service Worker）

## Global Constraints

- 统计**按币种分组，绝不跨币种求和**；单币种用户视觉上是一个总计，多币种自然分列（spec §6.4 规则 1）。
- 周/月边界按**用户时区**计算，不按 UTC；周起始日固定为**周一**（`zh`/`en-AU` locale 均如此，spec 已查证，不需要按 locale 动态判断）（spec §6.4 规则 2）。
- 统计**只对 `EXPENSE` 求"总支出"**，`INCOME` 单独展示，不做净额抵扣（spec §6.4 规则 3）。
- 统计口径以 **`date` 字段为准**，不以事件 `createdAt` 为准（spec §6.4 规则 4）。
- 编辑经由**追加事件**表达，不修改历史事件；修改分类/商户同时应更新该用户的 merchant 归一化词表（已有 `knownMerchants()` 自动覆盖，见下方"现状核查"）（spec §6.5）。
- 点击账目行**在原位展开为可编辑表单，不用模态**；统计页展开的明细行与主屏列表行是**同一个组件**（spec §13.2）。
- 底部只有**记账/统计**两个 tab；设置从头像进，不占永久 tab（spec §13.1）。
- Service Worker **不缓存任何 API 响应或账本数据**，只预缓存应用外壳（HTML/JS/CSS/图标），`/api/*` 一律 network-only（spec §13.4，硬性规则）。
- "可能被清除"文案仅 iOS + 未安装为真，安装引导在 iOS + 未安装 + 有未同步数据时提升为高优先级（spec §8.8，复用 Plan 3 已实现的 `isIOS`/`isStandalone`/`sync/status.ts` 的 `unsyncedIds`）。
- `lib/server/` 下的模块永不被客户端代码 import；`lib/ai/schema.ts` 是 `Transaction`/分类枚举的唯一定义处（既有约束，沿用）。

---

## 现状核查（写此 Plan 前对照实际代码，不是假设）

- `src/lib/ledger/events.ts` 的 `LedgerEvent` 已含 `transaction_amended`（`payload: { id, changes: Partial<Omit<Transaction,'id'>> }`）与 `transaction_deleted`（Plan 1 建的），**`store.ts` 只有 `removeTransaction`，没有 `amendTransaction`**——本 Plan 要补上。
- `src/lib/ledger/store.ts` 的 `knownMerchants()` **已经**在扫 `transaction_amended` 事件的 `changes.merchant`（Plan 1 写的），所以用户手动改商户名会自动进归一化词表，不需要额外代码。
- `src/lib/ai/schema.ts` 的 `atMostTwoDecimals` 是文件内部私有校验函数（未导出），编辑表单校验金额小数位数需要复用，本 Plan 会导出一个新的 `isValidYuanAmount`。
- `src/components/TransactionRow.tsx` 目前只读渲染，无点击交互；`LedgerList.tsx` 按日期分组渲染 `TransactionRow`。
- `src/app/page.tsx` 的 `<header>` 目前直接内联渲染登出按钮和用户邮箱——spec §13.1 的 IA 要求这些移进设置页，头像只是个入口。
- `next.config.ts` 已经有 `output: 'standalone'`（Plan 5 部署要用，已经提前配好，本 Plan 不用管），还有一条 `allowedDevOrigins` 是多设备测试期间加的，不动它。
- 项目里没有任何 PWA/manifest/Service Worker 相关文件或依赖，`.github/workflows`、`deploy/` 目录也不存在（部署相关，Plan 5 范围）。

---

### Task 1: schema.ts 导出金额校验函数

**Files:**
- Modify: `src/lib/ai/schema.ts`
- Test: `src/lib/ai/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `isValidYuanAmount(n: number): boolean`——供 Task 4 的编辑表单校验用户输入的金额。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/ai/__tests__/schema.test.ts` 追加：

```typescript
import { isValidYuanAmount } from '@/lib/ai/schema';

describe('isValidYuanAmount', () => {
  it('正数且最多两位小数时合法', () => {
    expect(isValidYuanAmount(54.3)).toBe(true);
    expect(isValidYuanAmount(1)).toBe(true);
    expect(isValidYuanAmount(0.01)).toBe(true);
  });

  it('超过两位小数时不合法', () => {
    expect(isValidYuanAmount(1.005)).toBe(false);
  });

  it('零或负数时不合法', () => {
    expect(isValidYuanAmount(0)).toBe(false);
    expect(isValidYuanAmount(-5)).toBe(false);
  });

  it('NaN/Infinity 时不合法', () => {
    expect(isValidYuanAmount(NaN)).toBe(false);
    expect(isValidYuanAmount(Infinity)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ai/__tests__/schema.test.ts`
Expected: FAIL，`isValidYuanAmount` 未导出。

- [ ] **Step 3: 实现**

在 `src/lib/ai/schema.ts` 里找到：

```typescript
/** 金额最多两位小数——规则三的前置校验，越界则 toCents 不再可证明正确 */
const atMostTwoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
```

在这行下面追加一个导出函数（`atMostTwoDecimals` 本身保持私有不变，`AiTransactionSchema` 的 `.refine(atMostTwoDecimals, ...)` 用法不受影响）：

```typescript
/** 编辑表单校验用户手改的金额——同一条规则（正数、最多两位小数），供 UI 层复用。 */
export function isValidYuanAmount(n: number): boolean {
  return Number.isFinite(n) && n > 0 && atMostTwoDecimals(n);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ai/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/ai/schema.ts src/lib/ai/__tests__/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(ai): 导出 isValidYuanAmount 供编辑表单复用金额校验规则

跟 AiTransactionSchema 内部用的是同一条规则（正数、最多两位小数），
避免编辑表单另写一套校验逻辑跟 AI 抽取路径的规则慢慢漂移。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: store.ts——amendTransaction

**Files:**
- Modify: `src/lib/ledger/store.ts`
- Test: `src/lib/ledger/__tests__/store.test.ts`

**Interfaces:**
- Consumes: 既有的 `createTransactionAmended` (`@/lib/ledger/events`)、`push`（文件内部函数）。
- Produces: `amendTransaction(id: string, changes: Partial<Omit<Transaction, 'id'>>): Promise<void>`——供 Task 5 的编辑表单调用。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/ledger/__tests__/store.test.ts` 追加：

```typescript
import { amendTransaction } from '@/lib/ledger/store';

describe('amendTransaction', () => {
  it('追加 transaction_amended 事件，账本里对应账目的字段被更新', async () => {
    const tx: Transaction = {
      id: 'tx-amend-1',
      type: 'EXPENSE',
      amountCents: 2500,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: '早餐',
    };
    await addTransactions([tx]);
    await amendTransaction('tx-amend-1', { category: 'TRANSPORT', amountCents: 3000 });

    const updated = getSnapshot().transactions.find((t) => t.id === 'tx-amend-1');
    expect(updated?.category).toBe('TRANSPORT');
    expect(updated?.amountCents).toBe(3000);
    expect(updated?.description).toBe('早餐'); // 没改的字段原样保留
  });

  it('修改 merchant 后，该写法进入 knownMerchants（回归：既有逻辑，验证未被破坏）', async () => {
    const tx: Transaction = {
      id: 'tx-amend-2',
      type: 'EXPENSE',
      amountCents: 1000,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: 'x',
    };
    await addTransactions([tx]);
    await amendTransaction('tx-amend-2', { merchant: 'Costco' });
    expect(knownMerchants()).toContain('Costco');
  });
});
```

（`addTransactions`/`getSnapshot`/`knownMerchants`/`Transaction` 在该测试文件里应该已经从既有用例中导入，若没有就按文件顶部既有的 import 风格补上。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/store.test.ts`
Expected: FAIL，`amendTransaction` 未导出。

- [ ] **Step 3: 实现**

在 `src/lib/ledger/store.ts` 顶部 import 里把：

```typescript
import {
  createTransactionCreated,
  createTransactionDeleted,
  createRawInputQueued,
  createRawInputResolved,
  type LedgerEvent,
  type RawInputQueuedPayload,
} from '@/lib/ledger/events';
```

改成加一个 `createTransactionAmended`：

```typescript
import {
  createTransactionCreated,
  createTransactionAmended,
  createTransactionDeleted,
  createRawInputQueued,
  createRawInputResolved,
  type LedgerEvent,
  type RawInputQueuedPayload,
} from '@/lib/ledger/events';
```

在 `removeTransaction` 函数旁边加：

```typescript
export async function amendTransaction(
  id: string,
  changes: Partial<Omit<Transaction, 'id'>>,
): Promise<void> {
  await push([createTransactionAmended(id, changes)]);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/store.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/ledger/store.ts src/lib/ledger/__tests__/store.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): store.ts 加 amendTransaction（编辑的数据层入口）

追加 transaction_amended 事件，不改历史事件，同步模型不变（spec §6.5、
§7）。merchant 归一化词表的更新复用 knownMerchants() 既有逻辑，
不需要额外代码。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `lib/ledger/stats.ts`——按周/月分类聚合

**Files:**
- Create: `src/lib/ledger/stats.ts`
- Test: `src/lib/ledger/__tests__/stats.test.ts`

**Interfaces:**
- Consumes: `Transaction`/`CategoryKey` (`@/lib/ai/schema`)。
- Produces: `type StatsPeriod = 'week' | 'month'`、`type CategoryTotal = { category: CategoryKey; totalCents: number; transactions: Transaction[] }`、`type CurrencyStats = { currency: string; expenseByCategory: CategoryTotal[]; totalExpenseCents: number; totalIncomeCents: number }`、`periodRange(period: StatsPeriod, referenceDate: Date, timeZone: string): { start: string; end: string }`（`start`/`end` 为 `YYYY-MM-DD`，`end` 不含）、`computeStats(transactions: Transaction[], period: StatsPeriod, referenceDate: Date, timeZone: string): CurrencyStats[]`——供 Task 6 的统计页使用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/ledger/__tests__/stats.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { periodRange, computeStats } from '@/lib/ledger/stats';
import type { Transaction } from '@/lib/ai/schema';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  type: 'EXPENSE',
  amountCents: 1000,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: 'x',
  ...over,
});

describe('periodRange', () => {
  it('month：返回当月第一天到下月第一天（不含），按指定时区', () => {
    // 2026-09-05 是周六；悉尼时间（UTC+10）此刻是 2026-09-05 早上，
    // UTC 此刻还是 2026-09-04 晚上——用来验证真的按 timeZone 算，不是按 UTC
    const referenceDate = new Date('2026-09-04T20:00:00Z');
    expect(periodRange('month', referenceDate, 'Australia/Sydney')).toEqual({
      start: '2026-09-01',
      end: '2026-10-01',
    });
  });

  it('month：12 月要跨年到下一年 1 月', () => {
    const referenceDate = new Date('2026-12-15T00:00:00Z');
    expect(periodRange('month', referenceDate, 'UTC')).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    });
  });

  it('week：周一为起点，跨度 7 天', () => {
    // 2026-09-09 是周三（UTC）
    const referenceDate = new Date('2026-09-09T12:00:00Z');
    const range = periodRange('week', referenceDate, 'UTC');
    expect(range.start).toBe('2026-09-07'); // 本周一
    expect(range.end).toBe('2026-09-14'); // 下周一
  });

  it('week：参考日本身就是周一时，起点是当天', () => {
    const referenceDate = new Date('2026-09-07T12:00:00Z'); // 周一
    expect(periodRange('week', referenceDate, 'UTC').start).toBe('2026-09-07');
  });

  it('week：参考日是周日时，起点是上周一（ISO 周日=当周最后一天）', () => {
    const referenceDate = new Date('2026-09-13T12:00:00Z'); // 周日
    expect(periodRange('week', referenceDate, 'UTC').start).toBe('2026-09-07');
  });
});

describe('computeStats', () => {
  const referenceDate = new Date('2026-09-05T00:00:00Z');

  it('按币种分组，不跨币种求和', () => {
    const out = computeStats(
      [tx({ currency: 'AUD', amountCents: 1000 }), tx({ currency: 'USD', amountCents: 2000 })],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out).toHaveLength(2);
    const aud = out.find((c) => c.currency === 'AUD');
    const usd = out.find((c) => c.currency === 'USD');
    expect(aud?.totalExpenseCents).toBe(1000);
    expect(usd?.totalExpenseCents).toBe(2000);
  });

  it('EXPENSE 按分类聚合总支出，INCOME 单独累计不参与抵扣', () => {
    const out = computeStats(
      [
        tx({ type: 'EXPENSE', category: 'FOOD', amountCents: 1000 }),
        tx({ type: 'EXPENSE', category: 'FOOD', amountCents: 500 }),
        tx({ type: 'EXPENSE', category: 'TRANSPORT', amountCents: 300 }),
        tx({ type: 'INCOME', category: 'SALARY', amountCents: 500000 }),
      ],
      'month',
      referenceDate,
      'UTC',
    );
    const aud = out[0];
    expect(aud.totalExpenseCents).toBe(1800); // 1000+500+300，收入不参与
    expect(aud.totalIncomeCents).toBe(500000);
    const food = aud.expenseByCategory.find((c) => c.category === 'FOOD');
    expect(food?.totalCents).toBe(1500);
    expect(food?.transactions).toHaveLength(2);
    // INCOME 类目不出现在 expenseByCategory 里
    expect(aud.expenseByCategory.find((c) => c.category === 'SALARY')).toBeUndefined();
  });

  it('expenseByCategory 按金额降序排列', () => {
    const out = computeStats(
      [
        tx({ category: 'FOOD', amountCents: 100 }),
        tx({ category: 'TRANSPORT', amountCents: 900 }),
      ],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out[0].expenseByCategory.map((c) => c.category)).toEqual(['TRANSPORT', 'FOOD']);
  });

  it('只统计口径落在当前周期内的账目（按 date 字段，不含边界外的）', () => {
    const out = computeStats(
      [
        tx({ date: '2026-08-31', amountCents: 100 }), // 上月最后一天，不算
        tx({ date: '2026-09-01', amountCents: 200 }), // 本月第一天，算
        tx({ date: '2026-09-30', amountCents: 300 }), // 本月最后一天，算
        tx({ date: '2026-10-01', amountCents: 400 }), // 下月第一天，不算
      ],
      'month',
      referenceDate,
      'UTC',
    );
    expect(out[0].totalExpenseCents).toBe(500);
  });

  it('周期内没有账目时返回空数组，不报错', () => {
    expect(computeStats([], 'month', referenceDate, 'UTC')).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/stats.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/ledger/stats.ts`：

```typescript
import type { CategoryKey, Transaction } from '@/lib/ai/schema';

export type StatsPeriod = 'week' | 'month';

export type CategoryTotal = {
  category: CategoryKey;
  totalCents: number;
  transactions: Transaction[];
};

export type CurrencyStats = {
  currency: string;
  expenseByCategory: CategoryTotal[];
  totalExpenseCents: number;
  totalIncomeCents: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKeyOfUtcNoon(utcNoon: Date): string {
  // utcNoon 已经是"用 UTC 读出来就是正确日历日"的构造，直接用 UTC 分量取值，
  // 不再经过 Intl 二次换算——避免另一层时区转换把日期挪一天。
  return `${utcNoon.getUTCFullYear()}-${pad2(utcNoon.getUTCMonth() + 1)}-${pad2(utcNoon.getUTCDate())}`;
}

/** 取某个时刻在指定时区下的日历日 { year, month(1-12), day, weekday(0=周日..6=周六) }。 */
function partsInTimeZone(
  d: Date,
  timeZone: string,
): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  };
}

/**
 * 周/月边界（spec §6.4 规则 2：按用户时区，不按 UTC；周一为周起点）。
 * 返回值是 YYYY-MM-DD 字符串——Transaction.date 本身就是已按用户时区
 * 解析好的日历日字符串（spec §5.4），直接做字符串比较即可判断是否落在
 * 周期内，不需要再对每条账目做时区转换。
 */
export function periodRange(
  period: StatsPeriod,
  referenceDate: Date,
  timeZone: string,
): { start: string; end: string } {
  const { year, month, day, weekday } = partsInTimeZone(referenceDate, timeZone);
  // 用 UTC 正午构造"代表这个日历日"的 Date，避免夏令时/边界问题——
  // 后续所有算术都在这个安全的 UTC 正午基准上做，最后按 UTC 分量读回字符串。
  const todayUtcNoon = new Date(Date.UTC(year, month - 1, day, 12));

  if (period === 'month') {
    const start = `${year}-${pad2(month)}-01`;
    const nextMonthUtcNoon = new Date(Date.UTC(year, month, 1, 12)); // Date.UTC 的月份天然进位跨年
    const end = dateKeyOfUtcNoon(nextMonthUtcNoon);
    return { start, end };
  }

  // week：weekday 0=周日..6=周六；周一为起点，需要回退的天数：周日回退 6 天，
  // 其余回退 (weekday - 1) 天。
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  const weekStartUtcNoon = new Date(todayUtcNoon);
  weekStartUtcNoon.setUTCDate(weekStartUtcNoon.getUTCDate() - daysSinceMonday);
  const weekEndUtcNoon = new Date(weekStartUtcNoon);
  weekEndUtcNoon.setUTCDate(weekEndUtcNoon.getUTCDate() + 7);
  return { start: dateKeyOfUtcNoon(weekStartUtcNoon), end: dateKeyOfUtcNoon(weekEndUtcNoon) };
}

/**
 * 按周/月的分类统计（spec §6.4）：对内存里的 Transaction[] 做一次 reduce，
 * 不引入索引/查询层。四条规则：按币种分组不跨币种求和、边界按用户时区、
 * 只对 EXPENSE 求总支出（INCOME 单独展示不抵扣）、口径以 date 字段为准。
 */
export function computeStats(
  transactions: Transaction[],
  period: StatsPeriod,
  referenceDate: Date,
  timeZone: string,
): CurrencyStats[] {
  const { start, end } = periodRange(period, referenceDate, timeZone);
  const inPeriod = transactions.filter((t) => t.date >= start && t.date < end);

  const byCurrency = new Map<string, CurrencyStats>();
  for (const t of inPeriod) {
    let stats = byCurrency.get(t.currency);
    if (!stats) {
      stats = { currency: t.currency, expenseByCategory: [], totalExpenseCents: 0, totalIncomeCents: 0 };
      byCurrency.set(t.currency, stats);
    }
    if (t.type === 'INCOME') {
      stats.totalIncomeCents += t.amountCents;
      continue;
    }
    stats.totalExpenseCents += t.amountCents;
    let cat = stats.expenseByCategory.find((c) => c.category === t.category);
    if (!cat) {
      cat = { category: t.category, totalCents: 0, transactions: [] };
      stats.expenseByCategory.push(cat);
    }
    cat.totalCents += t.amountCents;
    cat.transactions.push(t);
  }

  for (const stats of byCurrency.values()) {
    stats.expenseByCategory.sort((a, b) => b.totalCents - a.totalCents);
  }

  return [...byCurrency.values()];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/stats.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc --noEmit`

```bash
git add src/lib/ledger/stats.ts src/lib/ledger/__tests__/stats.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): 按周/月分类统计（stats.ts）

periodRange 按用户时区算周/月边界（周一为周起点），computeStats
按币种分组、只对 EXPENSE 聚合总支出、口径以 Transaction.date 为准
（spec §6.4 四条规则）。纯函数，对内存 Transaction[] 做一次 reduce，
不引入索引/查询层。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `EditForm` 组件——行内编辑表单

**Files:**
- Create: `src/components/EditForm.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/EditForm.test.tsx`

**Interfaces:**
- Consumes: `Transaction`/`CategoryKey`/`EXPENSE_CATEGORIES`/`INCOME_CATEGORIES`/`SHARED_CATEGORIES`/`isValidYuanAmount` (`@/lib/ai/schema`)、`CATEGORY_LABELS` (`@/lib/i18n/dictionary`)、`useLocale` (`@/lib/i18n/context`)。
- Produces: `EditForm` 组件，props `{ transaction: Transaction; onSave: (changes: Partial<Omit<Transaction, 'id'>>) => void; onDelete: () => void; onCancel: () => void }`——供 Task 5 的 `TransactionRow` 使用。

- [ ] **Step 1: 字典加 key**

`DictKey` 联合类型加：

```typescript
  | 'editSave'
  | 'editCancel'
  | 'editDelete'
  | 'editCategoryLabel'
  | 'editAmountLabel'
  | 'editDateLabel'
  | 'editMerchantLabel'
  | 'editDescriptionLabel'
  | 'editAmountInvalid'
```

`en`：

```typescript
  editSave: 'Save',
  editCancel: 'Cancel',
  editDelete: 'Delete',
  editCategoryLabel: 'Category',
  editAmountLabel: 'Amount',
  editDateLabel: 'Date',
  editMerchantLabel: 'Merchant',
  editDescriptionLabel: 'Description',
  editAmountInvalid: 'Enter a positive amount with at most 2 decimals',
```

`zh`：

```typescript
  editSave: '保存',
  editCancel: '取消',
  editDelete: '删除',
  editCategoryLabel: '分类',
  editAmountLabel: '金额',
  editDateLabel: '日期',
  editMerchantLabel: '商户',
  editDescriptionLabel: '描述',
  editAmountInvalid: '请输入正数金额，最多两位小数',
```

- [ ] **Step 2: 写失败的测试**

创建 `src/components/__tests__/EditForm.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { EditForm } from '@/components/EditForm';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: 'Woolworths',
  description: '买菜',
};

describe('EditForm', () => {
  it('字段用当前账目的值预填', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '25.00');
    expect(screen.getByLabelText('Date')).toHaveProperty('value', '2026-09-05');
    expect(screen.getByLabelText('Merchant')).toHaveProperty('value', 'Woolworths');
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
    expect(screen.getByLabelText('Category')).toHaveProperty('value', 'FOOD');
  });

  it('category 下拉只列出与 type 匹配的分类（EXPENSE 不出现 SALARY）', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('FOOD');
    expect(values).toContain('OTHER');
    expect(values).not.toContain('SALARY');
  });

  it('保存时把改动的字段（含金额换算成整数分）传给 onSave', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30.50' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TRANSPORT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      amountCents: 3050,
      category: 'TRANSPORT',
      date: '2026-09-05',
      merchant: 'Woolworths',
      description: '买菜',
    });
  });

  it('金额不合法时点保存不调用 onSave，显示错误提示', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a positive amount with at most 2 decimals')).toBeDefined();
  });

  it('商户留空时传 null（不是空字符串）', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ merchant: null }));
  });

  it('点删除调用 onDelete，点取消调用 onCancel', () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={onDelete} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/EditForm.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 4: 实现**

创建 `src/components/EditForm.tsx`：

```typescript
'use client';

import { useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SHARED_CATEGORIES,
  isValidYuanAmount,
  toCents,
  type CategoryKey,
  type Transaction,
} from '@/lib/ai/schema';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/context';

function categoriesFor(type: Transaction['type']): readonly CategoryKey[] {
  return type === 'EXPENSE'
    ? [...EXPENSE_CATEGORIES, ...SHARED_CATEGORIES]
    : [...INCOME_CATEGORIES, ...SHARED_CATEGORIES];
}

/**
 * 行内展开的编辑表单（spec §13.2：原位展开，不用模态）。
 * 只改动过的字段才有意义上传，但这里为简单起见每次保存都带上全部
 * 五个可编辑字段的当前值——amendTransaction 的 changes 是
 * Partial<Omit<Transaction,'id'>>，全带上也完全合法，且避免"哪些字段
 * 被用户碰过"这层额外状态。
 */
export function EditForm({
  transaction,
  onSave,
  onDelete,
  onCancel,
}: {
  transaction: Transaction;
  onSave: (changes: Partial<Omit<Transaction, 'id'>>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const { t, locale } = useLocale();
  const [category, setCategory] = useState<CategoryKey>(transaction.category);
  const [amountYuan, setAmountYuan] = useState((transaction.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(transaction.date);
  const [merchant, setMerchant] = useState(transaction.merchant ?? '');
  const [description, setDescription] = useState(transaction.description);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsed = Number(amountYuan);
    if (!isValidYuanAmount(parsed)) {
      setError(t('editAmountInvalid'));
      return;
    }
    setError(null);
    onSave({
      category,
      amountCents: toCents(parsed),
      date,
      merchant: merchant.trim() === '' ? null : merchant,
      description,
    });
  }

  return (
    <li>
      <label>
        {t('editCategoryLabel')}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CategoryKey)}
        >
          {categoriesFor(transaction.type).map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[locale][key]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('editAmountLabel')}
        <input
          type="text"
          inputMode="decimal"
          value={amountYuan}
          onChange={(e) => setAmountYuan(e.target.value)}
        />
      </label>
      <label>
        {t('editDateLabel')}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        {t('editMerchantLabel')}
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </label>
      <label>
        {t('editDescriptionLabel')}
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      {error && <span role="alert">{error}</span>}
      <button type="button" onClick={handleSave}>
        {t('editSave')}
      </button>
      <button type="button" onClick={onCancel}>
        {t('editCancel')}
      </button>
      <button type="button" onClick={onDelete}>
        {t('editDelete')}
      </button>
    </li>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/EditForm.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/EditForm.tsx src/components/__tests__/EditForm.test.tsx src/lib/i18n/dictionary.ts
git commit -m "$(cat <<'EOF'
feat(ui): EditForm——行内编辑表单（分类/金额/日期/商户/描述 + 删除）

原位展开，不用模态（spec §13.2）。category 下拉按 transaction.type
过滤合法分类；金额校验复用 isValidYuanAmount；商户留空存 null
而非空字符串，跟 AI 抽取路径的语义保持一致。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: TransactionRow 接入点击展开编辑

**Files:**
- Modify: `src/components/TransactionRow.tsx`
- Modify: `src/components/LedgerList.tsx`
- Test: `src/components/__tests__/LedgerList.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `amendTransaction`（`@/lib/ledger/store`）、既有的 `removeTransaction`；Task 4 的 `EditForm`。
- Produces: `TransactionRow` 新增可选 prop：无（点击行为内部自持状态，调用 store 的 `amendTransaction`/`removeTransaction`，不需要父组件传回调）。

**Why 不需要新 props：** `amendTransaction`/`removeTransaction` 是 store 的全局函数，`TransactionRow` 直接调用即可（跟 `VoiceButton` 直接调 `/api/stt`、`Composer` 直接接收 `onSubmit` 的既有模式一致——组件不需要逐层往上传递"如何保存"这件事）。

- [ ] **Step 1: 写失败的测试**

在 `src/components/__tests__/LedgerList.test.tsx` 追加：

```typescript
import { fireEvent, waitFor } from '@testing-library/react';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';

vi.mock('@/lib/ledger/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ledger/store')>(
    '@/lib/ledger/store',
  );
  return { ...actual, amendTransaction: vi.fn(), removeTransaction: vi.fn() };
});

describe('点击展开编辑', () => {
  it('点击一行展开编辑表单，显示当前字段值', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜'));
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
  });

  it('保存时调用 amendTransaction 并收起表单', async () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(amendTransaction).toHaveBeenCalledWith('a', expect.any(Object)));
    expect(screen.queryByLabelText('Description')).toBeNull();
  });

  it('点删除调用 removeTransaction 并收起表单', async () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeTransaction).toHaveBeenCalledWith('a'));
  });

  it('点取消收起表单，不调用任何保存/删除', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(amendTransaction).not.toHaveBeenCalled();
    expect(removeTransaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/LedgerList.test.tsx`
Expected: FAIL，点击不展开任何表单。

- [ ] **Step 3: 实现**

修改 `src/components/TransactionRow.tsx`：

```typescript
'use client';

import { useState } from 'react';
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot as getSyncSnapshot, type SyncState } from '@/lib/sync/status';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';
import { EditForm } from '@/components/EditForm';

const EMPTY_SYNC_STATE: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/** 整数分 → 两位小数字符串。展示层唯一的金额格式化入口 */
export function formatAmount(cents: number, _currency: string): string {
  return (cents / 100).toFixed(2);
}

export function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { locale } = useLocale();
  const syncState = useSyncExternalStore(subscribe, getSyncSnapshot, () => EMPTY_SYNC_STATE);
  const synced = !syncState.unsyncedIds.includes(transaction.id);
  const sign = transaction.type === 'INCOME' ? '+' : '-';
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditForm
        transaction={transaction}
        onSave={(changes) => {
          void amendTransaction(transaction.id, changes);
          setEditing(false);
        }}
        onDelete={() => {
          void removeTransaction(transaction.id);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <li onClick={() => setEditing(true)}>
      {/* 未同步/已同步的持久视觉标记（spec §8.5 第 1 点），零打扰、永久可见 */}
      <span aria-hidden="true">{synced ? '●' : '○'}</span>
      <span>{transaction.merchant ?? '—'}</span>
      <span>{transaction.description}</span>
      {/* category 存的是稳定英文 key（FOOD/TRANSPORT/…），这里只做展示层的
          本地化映射——切换 UI 语言不改变底层存储的 key（中英文支持要求 §6、§7）*/}
      <span>{CATEGORY_LABELS[locale][transaction.category]}</span>
      <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
    </li>
  );
}
```

`LedgerList.tsx` 不需要改动——它只是渲染 `TransactionRow`，点击展开的状态完全封装在 `TransactionRow` 内部。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/LedgerList.test.tsx`
Expected: PASS

- [ ] **Step 5: 跑全量回归 + 提交**

Run: `npm test -- --run`（确认之前那些"渲染商户与描述""category 显示"等既有用例仍然通过——点击行为不该破坏纯展示场景的断言）

```bash
git add src/components/TransactionRow.tsx src/components/__tests__/LedgerList.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): 点击账目行原位展开编辑表单（spec §13.2）

点击 <li> 切换成 EditForm；保存/删除直接调用 store 的
amendTransaction/removeTransaction，不经父组件转发回调。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 统计页

**Files:**
- Create: `src/app/stats/page.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/app/stats/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `computeStats`/`StatsPeriod`；既有的 `useLedger` (`@/lib/ledger/useLedger`)、`TransactionRow` (`@/components/TransactionRow`)、`CATEGORY_LABELS` (`@/lib/i18n/dictionary`)。

- [ ] **Step 1: 字典加 key**

`DictKey` 加：

```typescript
  | 'statsTabWeek'
  | 'statsTabMonth'
  | 'statsPrev'
  | 'statsNext'
  | 'statsTotalExpense'
  | 'statsTotalIncome'
  | 'statsEmpty'
```

`en`：

```typescript
  statsTabWeek: 'Week',
  statsTabMonth: 'Month',
  statsPrev: '◀',
  statsNext: '▶',
  statsTotalExpense: 'Total spent',
  statsTotalIncome: 'Income',
  statsEmpty: 'Nothing recorded in this period.',
```

`zh`：

```typescript
  statsTabWeek: '本周',
  statsTabMonth: '本月',
  statsPrev: '◀',
  statsNext: '▶',
  statsTotalExpense: '总支出',
  statsTotalIncome: '收入',
  statsEmpty: '这段时间还没有记录。',
```

- [ ] **Step 2: 写失败的测试**

创建 `src/app/stats/__tests__/page.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import StatsPage from '@/app/stats/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { addTransactions, hydrate } from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  type: 'EXPENSE',
  amountCents: 1000,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: 'x',
  ...over,
});

beforeEach(async () => {
  vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});
afterEach(() => vi.useRealTimers());

describe('统计页', () => {
  it('默认显示本月分类汇总与总支出', async () => {
    await addTransactions([
      tx({ category: 'FOOD', amountCents: 1000, description: '买菜' }),
      tx({ category: 'TRANSPORT', amountCents: 500, description: '打车' }),
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    expect(screen.getByText('Transport')).toBeDefined();
    expect(screen.getByText('15.00')).toBeDefined(); // 总支出 10+5
  });

  it('展开某个分类看明细，明细行是可编辑的 TransactionRow（同一组件）', async () => {
    await addTransactions([tx({ category: 'FOOD', description: '买菜' })]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    fireEvent.click(screen.getByText('Food'));
    expect(screen.getByText('买菜')).toBeDefined();
    // 点明细行能进入编辑态——证明复用的是主屏同一个 TransactionRow
    fireEvent.click(screen.getByText('买菜'));
    expect(screen.getByLabelText('Description')).toBeDefined();
  });

  it('周/月切换改变统计口径', async () => {
    await addTransactions([
      tx({ date: '2026-09-01', category: 'FOOD', amountCents: 1000 }), // 本月，不在本周
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('10.00')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(screen.getByText(/Nothing recorded/)).toBeDefined());
  });

  it('没有记录时显示空态文案', async () => {
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText(/Nothing recorded/)).toBeDefined());
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/app/stats/__tests__/page.test.tsx`
Expected: FAIL，页面不存在。

- [ ] **Step 4: 实现**

创建 `src/app/stats/page.tsx`：

```typescript
'use client';

import { useMemo, useState } from 'react';
import { useLedger } from '@/lib/ledger/useLedger';
import { computeStats, type StatsPeriod } from '@/lib/ledger/stats';
import { TransactionRow, formatAmount } from '@/components/TransactionRow';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useLocale } from '@/lib/i18n/context';

export default function StatsPage() {
  const ledger = useLedger();
  const { t, locale } = useLocale();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [expanded, setExpanded] = useState<string | null>(null);

  // referenceDate 用当前时刻即可——用户切"上一周/下一周"不在本 Plan 范围
  // （spec §3 明确"不做...任意区间"，MVP 只看当前周期）
  const stats = useMemo(
    () =>
      computeStats(
        ledger.transactions,
        period,
        new Date(),
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    [ledger.transactions, period],
  );

  return (
    <main>
      <div>
        <button type="button" onClick={() => setPeriod('week')} aria-pressed={period === 'week'}>
          {t('statsTabWeek')}
        </button>
        <button type="button" onClick={() => setPeriod('month')} aria-pressed={period === 'month'}>
          {t('statsTabMonth')}
        </button>
      </div>
      {stats.length === 0 ? (
        <p>{t('statsEmpty')}</p>
      ) : (
        stats.map((currencyStats) => (
          <section key={currencyStats.currency}>
            <ul>
              {currencyStats.expenseByCategory.map((cat) => (
                <li key={cat.category}>
                  <button type="button" onClick={() => setExpanded(expanded === cat.category ? null : cat.category)}>
                    {CATEGORY_LABELS[locale][cat.category]}
                  </button>
                  <span>{formatAmount(cat.totalCents, currencyStats.currency)}</span>
                  {expanded === cat.category && (
                    <ul>
                      {cat.transactions.map((transaction) => (
                        <TransactionRow key={transaction.id} transaction={transaction} />
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p>
              {t('statsTotalExpense')}: {formatAmount(currencyStats.totalExpenseCents, currencyStats.currency)}
            </p>
            <p>
              {t('statsTotalIncome')}: {formatAmount(currencyStats.totalIncomeCents, currencyStats.currency)}
            </p>
          </section>
        ))
      )}
    </main>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/app/stats/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 6: 跑全量回归 + 类型检查 + 提交**

Run: `npm test -- --run && npx tsc --noEmit`

```bash
git add src/app/stats/page.tsx src/app/stats/__tests__/page.test.tsx src/lib/i18n/dictionary.ts
git commit -m "$(cat <<'EOF'
feat(ui): 统计页——周/月切换、分类汇总、展开明细复用 TransactionRow

明细行是同一个 TransactionRow 组件（spec §13.2："统计页展开的明细
行与主屏列表行是同一个组件"），点开就能编辑，不是另一套只读展示。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 底部导航（记账/统计）

**Files:**
- Create: `src/components/BottomNav.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/BottomNav.test.tsx`

**Interfaces:**
- Produces: `BottomNav` 组件（无 props，内部用 `usePathname()` 判断当前 tab）。

- [ ] **Step 1: 字典加 key**

`DictKey` 加：

```typescript
  | 'navLedger'
  | 'navStats'
```

`en`：`navLedger: 'Ledger', navStats: 'Stats',`
`zh`：`navLedger: '记账', navStats: '统计',`

- [ ] **Step 2: 写失败的测试**

创建 `src/components/__tests__/BottomNav.test.tsx`：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { BottomNav } from '@/components/BottomNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('BottomNav', () => {
  it('渲染记账与统计两个入口', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('href', 'http://localhost:3000/');
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty('href', 'http://localhost:3000/stats');
  });

  it('当前所在页的入口带 aria-current', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('ariaCurrent', 'page');
    expect(screen.getByRole('link', { name: 'Stats' }).hasAttribute('aria-current')).toBe(false);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/BottomNav.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 4: 实现**

创建 `src/components/BottomNav.tsx`：

```typescript
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/context';

/** 底部只有记账/统计两个 tab；设置从头像进，不占永久 tab（spec §13.1）。 */
export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav>
      <Link href="/" aria-current={pathname === '/' ? 'page' : undefined}>
        {t('navLedger')}
      </Link>
      <Link href="/stats" aria-current={pathname === '/stats' ? 'page' : undefined}>
        {t('navStats')}
      </Link>
    </nav>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/BottomNav.test.tsx`
Expected: PASS

- [ ] **Step 6: 挂到 layout.tsx**

修改 `src/app/layout.tsx`，在 `<LocaleProvider>{children}</LocaleProvider>` 后面加 `<BottomNav />`（顶部 import 加 `import { BottomNav } from '@/components/BottomNav';`）：

```typescript
      <body>
        <LocaleProvider>
          {children}
          <BottomNav />
        </LocaleProvider>
      </body>
```

- [ ] **Step 7: 跑全量回归（含 layout 相关的既有页面测试）+ 提交**

Run: `npm test -- --run`

```bash
git add src/components/BottomNav.tsx src/components/__tests__/BottomNav.test.tsx src/app/layout.tsx src/lib/i18n/dictionary.ts
git commit -m "$(cat <<'EOF'
feat(ui): 底部导航（记账/统计两个 tab，spec §13.1）

挂在根 layout 里，所有页面共享；设置页不占用底部 tab，从头像进
（Task 9）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `navigator.storage.persist()` + 存储用量

**Files:**
- Create: `src/lib/pwa/storage.ts`
- Modify: `src/app/layout.tsx`
- Test: `src/lib/pwa/__tests__/storage.test.ts`

**Interfaces:**
- Produces: `requestPersistentStorage(): Promise<boolean>`、`getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null>`——供 Task 9 的设置页使用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/pwa/__tests__/storage.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage, getStorageEstimate } from '@/lib/pwa/storage';

afterEach(() => vi.unstubAllGlobals());

describe('requestPersistentStorage', () => {
  it('调用 navigator.storage.persist() 并返回结果', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it('浏览器不支持 storage.persist 时返回 false，不报错', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('getStorageEstimate', () => {
  it('返回已用/配额字节数', async () => {
    const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 1024 * 1024 });
    vi.stubGlobal('navigator', { storage: { estimate } });
    expect(await getStorageEstimate()).toEqual({ usageBytes: 1024, quotaBytes: 1024 * 1024 });
  });

  it('浏览器不支持时返回 null', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getStorageEstimate()).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/pwa/__tests__/storage.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/pwa/storage.ts`：

```typescript
/**
 * 申请持久化存储，避免磁盘压力下被驱逐（spec §6.3）。
 * 不是所有浏览器都实现这个 API（Safari 长期不支持），静默返回 false。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

/** 本地已用/配额字节数（spec §6.3："本地已用 X MB / 配额 Y MB"）。 */
export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage === undefined || quota === undefined) return null;
  return { usageBytes: usage, quotaBytes: quota };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/pwa/__tests__/storage.test.ts`
Expected: PASS

- [ ] **Step 5: layout.tsx 启动时申请持久化存储**

修改 `src/app/layout.tsx`，加一个客户端小组件在挂载时调用一次（`layout.tsx` 本身是 server component 惯例，用一个独立的小 client 组件承载这个副作用，不把整个 layout 变成 client component）：

创建 `src/components/PersistStorageOnMount.tsx`：

```typescript
'use client';

import { useEffect } from 'react';
import { requestPersistentStorage } from '@/lib/pwa/storage';

/** 应用启动时申请一次持久化存储（spec §6.3），不渲染任何内容。 */
export function PersistStorageOnMount() {
  useEffect(() => {
    void requestPersistentStorage();
  }, []);
  return null;
}
```

`src/app/layout.tsx` 加 `import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';`，在 `<LocaleProvider>` 内部开头加 `<PersistStorageOnMount />`：

```typescript
      <body>
        <LocaleProvider>
          <PersistStorageOnMount />
          {children}
          <BottomNav />
        </LocaleProvider>
      </body>
```

- [ ] **Step 6: 跑全量回归 + 提交**

Run: `npm test -- --run`

```bash
git add src/lib/pwa/storage.ts src/lib/pwa/__tests__/storage.test.ts src/components/PersistStorageOnMount.tsx src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(pwa): 启动时申请持久化存储 + 存储用量查询（spec §6.3）

requestPersistentStorage/getStorageEstimate 对不支持的浏览器
（Safari 长期不支持 persist()）静默降级，不报错。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 设置页——账号/登出、存储用量、导出备份

**Files:**
- Create: `src/app/settings/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/app/settings/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: 既有的 `useSession`/`fetchLogout` (`@/lib/auth/client`)、`exportBackup` (`@/lib/sync/export`，Plan 3)；Task 8 的 `getStorageEstimate`。

- [ ] **Step 1: 字典加 key**

`DictKey` 加：

```typescript
  | 'settingsTitle'
  | 'settingsAccount'
  | 'settingsStorageUsage'
  | 'settingsExport'
  | 'settingsAvatarLabel'
```

`en`：

```typescript
  settingsTitle: 'Settings',
  settingsAccount: 'Account',
  settingsStorageUsage: ({ used, quota }) => `Local storage: ${used} MB / ${quota} MB`,
  settingsExport: 'Export backup',
  settingsAvatarLabel: 'Settings',
```

`zh`：

```typescript
  settingsTitle: '设置',
  settingsAccount: '账号',
  settingsStorageUsage: ({ used, quota }) => `本地已用 ${used} MB / 配额 ${quota} MB`,
  settingsExport: '导出备份',
  settingsAvatarLabel: '设置',
```

- [ ] **Step 2: 写失败的测试**

创建 `src/app/settings/__tests__/page.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import SettingsPage from '@/app/settings/page';

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/pwa/storage', () => ({
  getStorageEstimate: vi.fn().mockResolvedValue({ usageBytes: 1024 * 1024, quotaBytes: 100 * 1024 * 1024 }),
}));
vi.mock('@/lib/sync/export', () => ({ exportBackup: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('设置页', () => {
  it('显示账号邮箱与存储用量', async () => {
    render(<SettingsPage />);
    expect(screen.getByText('u@example.com')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Local storage: 1.00 MB / 100.00 MB')).toBeDefined());
  });

  it('点登出调用 fetchLogout', async () => {
    const { fetchLogout } = await import('@/lib/auth/client');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(fetchLogout).toHaveBeenCalled();
  });

  it('点导出备份调用 exportBackup', async () => {
    const { exportBackup } = await import('@/lib/sync/export');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/app/settings/__tests__/page.test.tsx`
Expected: FAIL，页面不存在。

- [ ] **Step 4: 实现**

创建 `src/app/settings/page.tsx`：

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSession, fetchLogout } from '@/lib/auth/client';
import { getStorageEstimate } from '@/lib/pwa/storage';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';

export default function SettingsPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const [usage, setUsage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);

  useEffect(() => {
    void getStorageEstimate().then(setUsage);
  }, []);

  const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

  return (
    <main>
      <h1>{t('settingsTitle')}</h1>
      <section>
        <h2>{t('settingsAccount')}</h2>
        {user && <p>{user.email ?? user.googleSub}</p>}
        <button type="button" onClick={() => void fetchLogout()} disabled={loading}>
          {t('logOut')}
        </button>
      </section>
      {usage && (
        <p>{t('settingsStorageUsage', { used: toMb(usage.usageBytes), quota: toMb(usage.quotaBytes) })}</p>
      )}
      <button type="button" onClick={() => void exportBackup()}>
        {t('settingsExport')}
      </button>
    </main>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/app/settings/__tests__/page.test.tsx`
Expected: PASS

- [ ] **Step 6: page.tsx 头像入口替换内联登出**

修改 `src/app/page.tsx`，把 `<header>` 里内联的用户邮箱+登出按钮，换成一个指向 `/settings` 的头像链接（不再直接在主屏渲染登出，符合 spec §13.1 的 IA）：

把：

```typescript
        {user && (
          <div>
            <span>{user.email ?? user.googleSub}</span>
            <button
              type="button"
              onClick={() => void fetchLogout()}
              disabled={loading}
            >
              {t('logOut')}
            </button>
          </div>
        )}
```

改成：

```typescript
        {user && (
          <a href="/settings" aria-label={t('settingsAvatarLabel')}>
            {user.picture ? (
              <img src={user.picture} alt="" width={32} height={32} />
            ) : (
              (user.email ?? user.googleSub).slice(0, 1).toUpperCase()
            )}
          </a>
        )}
```

`fetchLogout`/`loading` 若在 `page.tsx` 别处不再用到，删掉对应 import（`useSession` 的 `loading` 仍用于 `authed` 判断，保留；`fetchLogout` 的 import 如果只有这一处用到就删掉）。

- [ ] **Step 7: 更新 page.tsx 既有测试里对登出按钮的断言**

`src/app/__tests__/page-guest.test.tsx` 里 `expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();` 这条对未登录场景仍然成立（未登录时 `user` 为空，头像链接也不渲染，无需改）。

检查 `src/app/__tests__/page.test.tsx`/`optimistic.test.tsx` 里是否有对"登出"按钮的断言（登录态场景）——如果有，把 `screen.getByRole('button', { name: 'Log out' })` 换成 `screen.getByRole('link', { name: 'Settings' })`，反映新的 IA（头像是链接不是按钮）。

- [ ] **Step 8: 跑全量回归 + 类型检查 + 提交**

Run: `npm test -- --run && npx tsc --noEmit`

```bash
git add src/app/settings/page.tsx src/app/settings/__tests__/page.test.tsx src/app/page.tsx src/lib/i18n/dictionary.ts src/app/__tests__/page.test.tsx src/app/__tests__/optimistic.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): 设置页（账号/登出、存储用量、导出备份），主屏头像替代内联登出

符合 spec §13.1 的 IA：登出/存储/导出这些低频操作不占主屏空间，
从头像进设置页。导出备份复用 Plan 3 的 exportBackup，不是新实现。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: PWA manifest + 图标

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/icon.svg`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- 无代码接口——静态资源 + `<head>` 里的引用标签，供浏览器的可安装性判定读取（spec §13.4 提到"PWA 安装是既定要求"，manifest 是安装的前提之一）。

- [ ] **Step 1: 创建图标**

创建 `public/icon.svg`（简单占位图标，视觉设计留给你后续调整——spec §13 明确"视觉设计刻意不在此确定"，这里只满足"必须有一个图标"这个技术要求）：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1a1a1a"/>
  <text x="256" y="330" font-size="280" font-family="sans-serif" fill="#ffffff" text-anchor="middle">J</text>
</svg>
```

- [ ] **Step 2: 创建 manifest**

创建 `public/manifest.webmanifest`：

```json
{
  "name": "JustSayIt",
  "short_name": "JustSayIt",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a1a",
  "icons": [
    {
      "src": "/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any"
    }
  ]
}
```

- [ ] **Step 3: layout.tsx 引用 manifest**

修改 `src/app/layout.tsx`，把：

```typescript
export const metadata = { title: 'JustSayIt' };
```

改成：

```typescript
export const metadata = {
  title: 'JustSayIt',
  manifest: '/manifest.webmanifest',
};
```

（Next.js 的 `metadata.manifest` 会自动在 `<head>` 里生成 `<link rel="manifest">` 标签，不需要手写。）

- [ ] **Step 4: 验证**

Run: `npx next build` 后 `npx next start`，浏览器打开首页，DevTools → Application → Manifest 面板应该能看到 `JustSayIt`、图标、`display: standalone`，没有报错。

- [ ] **Step 5: 提交**

```bash
git add public/manifest.webmanifest public/icon.svg src/app/layout.tsx
git commit -m "$(cat <<'EOF'
feat(pwa): 加 web app manifest + 占位图标

满足可安装性判定的前提条件之一（另一个是 Task 11 的 Service
Worker）。图标是纯技术占位，视觉设计留到之后调整（spec §13 明确
不在此确定视觉）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Service Worker（Serwist）——只缓存外壳

**Files:**
- Modify: `package.json`（加依赖）
- Create: `src/app/sw.ts`
- Modify: `next.config.ts`
- Test: `src/app/__tests__/sw.test.ts`

**Interfaces:**
- 无跨文件代码接口——这是构建期 + 运行时的 Service Worker 配置，产物是浏览器自动加载的 `/sw.js`。

- [ ] **Step 1: 装依赖**

```bash
npm install @serwist/next serwist
```

- [ ] **Step 2: 写一条验证 SW 排除规则的测试**

创建 `src/app/__tests__/sw.test.ts`（验证 `/api/*` 确实被排除在预缓存匹配规则之外，而不是等到跑起来真实 SW 才发现这个硬性规则被破坏）：

```typescript
import { describe, it, expect } from 'vitest';
import { runtimeCaching } from '@/app/sw';

describe('Service Worker runtimeCaching 规则（spec §13.4 硬性规则）', () => {
  it('不包含任何匹配 /api/ 路径的缓存规则', () => {
    for (const rule of runtimeCaching) {
      const matcher = rule.matcher;
      if (typeof matcher === 'function') continue; // 函数形式的 matcher 另行人工审查
      const pattern = matcher instanceof RegExp ? matcher.source : String(matcher);
      expect(pattern).not.toMatch(/\/api\//);
    }
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/app/__tests__/sw.test.ts`
Expected: FAIL，`src/app/sw.ts` 不存在。

- [ ] **Step 4: 实现 sw.ts**

创建 `src/app/sw.ts`：

```typescript
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * 只缓存应用外壳，绝不缓存任何 API 响应或账本数据（spec §13.4 硬性规则）。
 * defaultCache 是 Serwist 给 Next.js App Router 的默认策略集，本身已经
 * 排除 /api/*；这里额外加一条测试（sw.test.ts）盯住这条规则，不靠"读一遍
 * 文档相信它"。
 */
export const runtimeCaching = defaultCache;

export const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/app/__tests__/sw.test.ts`
Expected: PASS

- [ ] **Step 6: next.config.ts 接入 Serwist**

修改 `next.config.ts`：

```typescript
import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 开发环境局域网多设备测试用：允许通过 nip.io 域名访问 dev server 而不被
  // Next.js 的跨域请求保护拦截（见 docs/superpowers/specs 中登录多设备测试说明）
  allowedDevOrigins: ['192.168.1.55.nip.io'],
};

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
});

export default withSerwist(nextConfig);
```

- [ ] **Step 7: 验证构建产物**

Run: `npx next build`
Expected: 构建成功，`public/sw.js` 生成。

Run: `npx tsc --noEmit`
Expected: 0 错误

- [ ] **Step 8: 提交**

```bash
git add package.json package-lock.json src/app/sw.ts next.config.ts src/app/__tests__/sw.test.ts
git commit -m "$(cat <<'EOF'
feat(pwa): 接入 Serwist Service Worker，只缓存应用外壳

runtimeCaching 复用 Serwist 给 App Router 的默认策略集（本身已排除
/api/*），额外加一条测试直接断言这条硬性规则（spec §13.4），不只
靠读文档相信它。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 安装引导——`beforeinstallprompt` 捕获

**Files:**
- Create: `src/lib/pwa/install.ts`
- Test: `src/lib/pwa/__tests__/install.test.ts`

**Interfaces:**
- Produces: `initInstallPromptCapture(): () => void`（挂载 `beforeinstallprompt` 监听，返回取消订阅函数）、`canPromptInstall(): boolean`、`promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'>`、`shouldPrioritizeInstallGuidance(opts: { hasUnsyncedData: boolean }): boolean`——供 Task 13 的 `InstallBanner` 使用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/pwa/__tests__/install.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));

import { isIOS, isStandalone } from '@/lib/platform';
import {
  initInstallPromptCapture,
  canPromptInstall,
  promptInstall,
  shouldPrioritizeInstallGuidance,
} from '@/lib/pwa/install';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initInstallPromptCapture / canPromptInstall / promptInstall', () => {
  it('捕获 beforeinstallprompt 事件后 canPromptInstall 变 true', () => {
    const cleanup = initInstallPromptCapture();
    expect(canPromptInstall()).toBe(false);

    const event = new Event('beforeinstallprompt') as Event & { preventDefault: () => void };
    event.preventDefault = vi.fn();
    window.dispatchEvent(event);

    expect(canPromptInstall()).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled(); // 阻止浏览器默认的迷你信息栏
    cleanup();
  });

  it('promptInstall 在没有捕获到事件时返回 unavailable（iOS 等没有这个 API 的平台）', async () => {
    initInstallPromptCapture();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('promptInstall 调用捕获到的事件的 prompt()，返回用户选择结果', async () => {
    initInstallPromptCapture();
    const event = new Event('beforeinstallprompt') as Event & {
      preventDefault: () => void;
      prompt: () => void;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    event.preventDefault = vi.fn();
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);

    expect(await promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalled();
  });
});

describe('shouldPrioritizeInstallGuidance（spec §8.8）', () => {
  it('iOS + 未安装 + 有未同步数据 → 高优先级', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(true);
  });

  it('iOS 但已安装 → 不需要高优先级（已有 ITP 豁免）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(false);
  });

  it('iOS + 未安装但没有未同步数据 → 不需要高优先级', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: false })).toBe(false);
  });

  it('非 iOS → 不适用这条高优先级规则', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/pwa/__tests__/install.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/pwa/install.ts`：

```typescript
import { isIOS, isStandalone } from '@/lib/platform';

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let capturedEvent: BeforeInstallPromptEvent | null = null;

/**
 * 捕获 Chrome/Android 的 beforeinstallprompt 事件（iOS 没有这个 API，
 * 只能靠手动引导，见 Task 13 的 InstallBanner）。阻止浏览器自带的
 * 迷你信息栏，改由我们自己的引导 UI 决定何时、以什么优先级出现
 * （spec §8.8）。
 */
export function initInstallPromptCapture(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    e.preventDefault();
    capturedEvent = e as BeforeInstallPromptEvent;
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => {
    window.removeEventListener('beforeinstallprompt', handler);
    capturedEvent = null;
  };
}

export function canPromptInstall(): boolean {
  return capturedEvent !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!capturedEvent) return 'unavailable';
  capturedEvent.prompt();
  const { outcome } = await capturedEvent.userChoice;
  capturedEvent = null;
  return outcome;
}

/**
 * 检测到「iOS + 未安装 + 有未同步数据」时，安装引导提升为高优先级
 * （spec §8.8）：此刻安装能一次性解决 ITP 清除与无法推送两个问题，
 * 且用户正处在能听进去的情境（刚看到"尚未同步"的预警）。
 */
export function shouldPrioritizeInstallGuidance(opts: { hasUnsyncedData: boolean }): boolean {
  return isIOS() && !isStandalone() && opts.hasUnsyncedData;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/pwa/__tests__/install.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/pwa/install.ts src/lib/pwa/__tests__/install.test.ts
git commit -m "$(cat <<'EOF'
feat(pwa): beforeinstallprompt 捕获 + 安装引导优先级判定（spec §8.8）

Android/Chrome 走 beforeinstallprompt 事件触发原生安装弹窗；iOS
没有这个 API，只能手动引导（Task 13）。shouldPrioritizeInstallGuidance
复用 Plan 3 已有的 isIOS/isStandalone，加上"是否有未同步数据"这个信号。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `InstallBanner` 组件 + 接入设置页

**Files:**
- Create: `src/components/InstallBanner.tsx`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/InstallBanner.test.tsx`

**Interfaces:**
- Consumes: Task 12 的 `initInstallPromptCapture`/`canPromptInstall`/`promptInstall`；既有的 `isIOS`/`isStandalone` (`@/lib/platform`)。

- [ ] **Step 1: 字典加 key**

`DictKey` 加：

```typescript
  | 'installTitle'
  | 'installActionAndroid'
  | 'installInstructionsIOS'
  | 'installAlreadyInstalled'
```

`en`：

```typescript
  installTitle: 'Install JustSayIt',
  installActionAndroid: 'Install',
  installInstructionsIOS: 'Tap the Share button, then "Add to Home Screen".',
  installAlreadyInstalled: 'Already installed to your home screen.',
```

`zh`：

```typescript
  installTitle: '安装 JustSayIt',
  installActionAndroid: '安装',
  installInstructionsIOS: '点击分享按钮，选择"添加到主屏幕"。',
  installAlreadyInstalled: '已经安装到主屏幕了。',
```

- [ ] **Step 2: 写失败的测试**

创建 `src/components/__tests__/InstallBanner.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { InstallBanner } from '@/components/InstallBanner';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({
  initInstallPromptCapture: vi.fn(() => () => {}),
  canPromptInstall: vi.fn(),
  promptInstall: vi.fn(),
}));

import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';

beforeEach(() => vi.clearAllMocks());

describe('InstallBanner', () => {
  it('已安装时显示"已安装"提示，没有任何操作按钮', () => {
    vi.mocked(isStandalone).mockReturnValue(true);
    render(<InstallBanner />);
    expect(screen.getByText('Already installed to your home screen.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('iOS 未安装时显示手动引导文案，没有可点击的安装按钮', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    render(<InstallBanner />);
    expect(screen.getByText(/Add to Home Screen/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('Android 未安装且浏览器支持 beforeinstallprompt 时显示安装按钮，点击触发 promptInstall', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(true);
    render(<InstallBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(promptInstall).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/InstallBanner.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 4: 实现**

创建 `src/components/InstallBanner.tsx`：

```typescript
'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '@/lib/platform';
import { initInstallPromptCapture, canPromptInstall, promptInstall } from '@/lib/pwa/install';
import { useLocale } from '@/lib/i18n/context';

export function InstallBanner() {
  const { t } = useLocale();
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    const cleanup = initInstallPromptCapture();
    // beforeinstallprompt 触发时机不确定，轮询一次挂载后的状态即可——
    // 这个横幅本身不是高频重渲染的组件，用 useSyncExternalStore 属于过度设计。
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => {
      cleanup();
      clearInterval(id);
    };
  }, []);

  if (isStandalone()) {
    return (
      <div>
        <p>{t('installAlreadyInstalled')}</p>
      </div>
    );
  }

  return (
    <div>
      <p>{t('installTitle')}</p>
      {isIOS() ? (
        <p>{t('installInstructionsIOS')}</p>
      ) : (
        installable && (
          <button type="button" onClick={() => void promptInstall()}>
            {t('installActionAndroid')}
          </button>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/InstallBanner.test.tsx`
Expected: PASS

- [ ] **Step 6: 接入设置页**

修改 `src/app/settings/page.tsx`，顶部加 `import { InstallBanner } from '@/components/InstallBanner';`，在 `</section>`（存储用量那段）之后加：

```typescript
      <InstallBanner />
```

- [ ] **Step 7: 跑全量回归 + 类型检查 + 提交**

Run: `npm test -- --run && npx tsc --noEmit`

```bash
git add src/components/InstallBanner.tsx src/components/__tests__/InstallBanner.test.tsx src/app/settings/page.tsx src/lib/i18n/dictionary.ts
git commit -m "$(cat <<'EOF'
feat(ui): InstallBanner——按平台展示安装引导，接入设置页

已安装 → 提示已安装；iOS 未安装 → 手动图文引导（没有 beforeinstallprompt
API）；Android 未安装 → 原生安装按钮。spec §8.8 的高优先级判定
（shouldPrioritizeInstallGuidance）留给调用方（比如 SyncWarning 触发时
可以引用这个函数决定是否更显眼地引导）——本 task 先把可安装的横幅本身
做完。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 记录

**Spec 覆盖检查：**
- §6.3 附加要求（`persist()`、`estimate()`、设置页展示）→ Task 8、Task 9
- §6.4 统计视图四条规则 → Task 3（`stats.ts`）、Task 6（统计页）
- §6.5 账目编辑（最小字段范围、追加事件、merchant 词表联动）→ Task 1、Task 2、Task 4、Task 5
- §8.8 安装引导时机（iOS+未安装+有未同步数据→高优先级）→ Task 12 的 `shouldPrioritizeInstallGuidance`（复用 Plan 3 的 `isIOS`/`isStandalone`/`unsyncedIds`）
- §13.1 屏幕清单与导航（底部两个 tab、设置从头像进、同步状态点已在主屏）→ Task 7、Task 9
- §13.2 编辑交互（原位展开不用模态、统计页明细复用同一组件）→ Task 4、Task 5、Task 6
- §13.4 Service Worker（只缓存外壳、`/api/*` network-only）→ Task 10、Task 11

**未覆盖、且确认属于本 Plan 范围之外的部分：** §12（部署、CI/CD、Oracle VM）——单列 Plan 5，本次讨论已确认。§3 明确不做的"任意区间统计""趋势图""预算对比"本来就不在 MVP 范围，不是本 Plan 遗漏。

**占位符扫描：** 全文没有 "TBD"/"实现细节自行补充" 之类的占位表达；每个 Step 的代码块都是可以直接落盘的完整实现。

**类型一致性检查：** `amendTransaction(id, changes)` 在 Task 2 定义、Task 5 调用，签名一致；`computeStats`/`periodRange`/`StatsPeriod`/`CurrencyStats`/`CategoryTotal` 在 Task 3 定义、Task 6 调用，字段名（`expenseByCategory`/`totalExpenseCents`/`totalIncomeCents`）前后一致，未出现 `expensesByCategory`/`totalExpense` 这类漂移写法；`EditForm` 的 props（`onSave`/`onDelete`/`onCancel`）在 Task 4 定义、Task 5 调用方式一致。
