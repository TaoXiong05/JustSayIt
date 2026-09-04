# Drive 同步 + 状态预警 + 离线队列 + 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让账本在多台设备间通过用户自己的 Google Drive appDataFolder 同步，同步状态对用户可见并分级预警，网络不可用时账目照常记录（离线队列，联网后自动补跑 AI），并提供不依赖任何外部服务的一键导出兜底。

**Architecture:** 每台设备只写自己的 `events-<deviceId>.jsonl`，永不写别的设备的文件，因此结构上不存在写冲突（不需要冲突合并逻辑）。同步 = 上传本设备全部事件 → 下载其它设备文件 → 按 `eventId` 去重合并进本地 IndexedDB → 全量重放。Drive API 调用全部发生在浏览器（`lib/sync/`），后端（`/api/drive-token`）只做“用加密存储的 refresh token 换一个短期 access token”这一件事，账本内容不流经后端。离线时的文本输入落一个新事件类型 `raw_input_queued`，联网后自动补跑 `/api/structure` 并追加 `transaction_created` + `raw_input_resolved`。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript 5、IndexedDB via `idb`（已用于 Plan 1）、原生 `fetch` 直连 Google Drive REST API（不引入 `googleapis` SDK——同步全在浏览器发生，SDK 面向 Node 环境用不上）、Vitest + Testing Library、`useSyncExternalStore`（沿用 Plan 1 的账本状态管理模式）。

**Spec:** `docs/superpowers/specs/2026-09-04-justsayit-design.md`（本 Plan 覆盖 §5.1 剩余事件类型、§7、§8、§9 离线队列部分、§11.3 令牌流、§13.1 同步状态点、§13.3 `lib/sync/` 目录）

## Global Constraints

- 每台设备在 Drive `appDataFolder` 写**仅属于自己**的 `events-<deviceId>.jsonl`，只追加不改；设备之间永不写同一文件，不实现、也不需要冲突合并逻辑（spec §7）。
- 事件写入本地后**尽快**推送 Drive，不做批量攒批（spec §7 同步时机）。
- 两类同步失败区分处理：**A 类**（授权/API 失败：token 失效、用户撤销授权、Drive 配额满、接口错误）——不设时间阈值，立刻显眼提示并引导重新授权；**B 类**（网络不可用）——按未同步时长分级：<24h 状态点提示不打扰，24–72h 持久横幅（非模态、不可关闭），>72h 弹一次模态提供“重试同步”与“导出备份”两个动作（spec §8.3–8.4）。
- “可能被删除”这句文案**仅在 iOS + 未安装到主屏幕**时为真；其它平台一律用“尚未备份到云端”，不制造不必要的焦虑（spec §8.6）。
- 一键导出**不依赖授权、网络或平台特性**，是整套预警机制中最坏情况下唯一仍然有效的部分（spec §8.7）。
- 离线时新文本输入写 `raw_input_queued` 事件并显示“待处理”，联网后自动补跑 AI 结构化；固有约束是结构化依赖网络，离线队列只是缓解，不是消除（spec §9、§11.4）。
- 账本内容永远由浏览器直接发往 Google Drive，绝不流经后端；后端只持有加密的 refresh token，仅用于换取短期 access token（spec §11.3）。
- `lib/server/` 下的模块永不被客户端代码 import（既有约束，越界会把 Prisma 和密钥打进浏览器 bundle）。
- `lib/ai/schema.ts` 是 `Transaction` 与分类枚举的唯一定义处，本 Plan 不新增/修改该文件。
- `lib/ledger/` 保持对 Drive/同步完全无感知——同步的触发、状态、Drive I/O 全部在 `lib/sync/` 下，两者之间只通过 `lib/ledger/store.ts` 已公开的 `subscribe`/`getSnapshot` 类接口交互，不建立反向 import（避免循环依赖）。

---

## 现状核查（写此 Plan 前对照实际代码，不是假设）

- `src/lib/ledger/events.ts` 已有 `getDeviceId()`（localStorage 持久化的设备 id）与 `transaction_created`/`transaction_amended`/`transaction_deleted` 三种事件构造函数。**`raw_input_queued`/`raw_input_resolved` 尚未实现**（spec §5.1 定义了但代码没有）。
- `src/lib/ledger/db.ts` 的 `appendEvents()` 已经按 `eventId` 去重写入——这正是 §7 合并远端事件所需要的去重语义，直接复用，不用重新实现。
- `src/lib/ledger/replay.ts` 的 `switch (e.kind)` 目前只处理三种事件；新增两种事件类型后 TypeScript 的联合类型穷尽性检查会报错，必须显式加 `case`（哪怕是空操作）。
- `src/lib/ledger/store.ts` 的 `getSnapshot()` 只暴露重放后的 `Ledger`，不暴露原始事件数组——新增的“待处理队列展示”需要原始事件，因此要新增一个同样满足“稳定引用直到变更”规则的 `getEventsSnapshot()`。
- `src/lib/server/crypto.ts` 的 `encryptRefreshToken`/`decryptRefreshToken` 已存在且已测试；`src/app/api/auth/callback/route.ts` 登录时已经调用 `encryptRefreshToken` 并落库到 `User.refreshTokenEnc`。**`decryptRefreshToken` 目前没有任何调用方**——本 Plan 的 `/api/drive-token` 是第一个用它的地方。
- `src/lib/auth/oauth.ts` 的 OAuth scope 已含 `drive.appdata`，`access_type=offline` 已设置，`exchangeCode()` 已返回 `refreshToken`。**没有用 refresh token 换 access token 的函数**——本 Plan 新增。
- `prisma/schema.prisma` 的 `User.refreshTokenEnc` 字段已存在，注释就写着“Plan 3 用”。不需要新 migration。
- `src/lib/server/user.ts` 的 `findOrCreateUser` 返回的 `UserProfile` 类型**不包含** `refreshTokenEnc`（有意为之，避免这个敏感字段随手传播）；需要新增一个专门读它的函数。
- `src/app/page.tsx` 的 `handleSubmit` 里直接内联了“fetch /api/structure → 校验 → normalizeMerchant → toTransaction”的完整逻辑，离线队列补跑需要同一段逻辑，因此第一步先把它提取成可复用函数（Task 3），而不是复制一份——复制会导致两处对 AI 响应的校验/归一化行为逐渐漂移。

---

### Task 1: 事件类型——离线队列的两个事件

**Files:**
- Modify: `src/lib/ledger/events.ts`
- Modify: `src/lib/ledger/replay.ts`
- Test: `src/lib/ledger/__tests__/events.test.ts`
- Test: `src/lib/ledger/__tests__/replay.test.ts`

**Interfaces:**
- Produces: `RawInputQueuedPayload = { id: string; text: string; localTime: string; timeZone: string; defaultCurrency: string }`、`RawInputResolvedPayload = { queuedId: string }`、`createRawInputQueued(input: Omit<RawInputQueuedPayload, 'id'>): LedgerEvent`（`kind: 'raw_input_queued'`）、`createRawInputResolved(queuedId: string): LedgerEvent`（`kind: 'raw_input_resolved'`）——供 Task 2 的 `store.ts` 使用。

- [ ] **Step 1: 写失败的测试（events.ts）**

在 `src/lib/ledger/__tests__/events.test.ts` 末尾追加：

```typescript
import {
  createRawInputQueued,
  createRawInputResolved,
} from '@/lib/ledger/events';

describe('createRawInputQueued / createRawInputResolved', () => {
  it('createRawInputQueued 生成含唯一 id 的排队事件', () => {
    const e = createRawInputQueued({
      text: '买菜50块',
      localTime: '2026-09-05T10:00:00+10:00',
      timeZone: 'Australia/Sydney',
      defaultCurrency: 'AUD',
    });
    expect(e.kind).toBe('raw_input_queued');
    if (e.kind !== 'raw_input_queued') throw new Error('unreachable');
    expect(e.payload.text).toBe('买菜50块');
    expect(e.payload.id).toBeTruthy();
    expect(e.deviceId).toBe(getDeviceId());
  });

  it('两次调用生成不同的 payload.id（每条排队输入独立标识）', () => {
    const a = createRawInputQueued({
      text: 'x',
      localTime: '2026-09-05T10:00:00+10:00',
      timeZone: 'Australia/Sydney',
      defaultCurrency: 'AUD',
    });
    const b = createRawInputQueued({
      text: 'x',
      localTime: '2026-09-05T10:00:00+10:00',
      timeZone: 'Australia/Sydney',
      defaultCurrency: 'AUD',
    });
    if (a.kind !== 'raw_input_queued' || b.kind !== 'raw_input_queued') {
      throw new Error('unreachable');
    }
    expect(a.payload.id).not.toBe(b.payload.id);
  });

  it('createRawInputResolved 携带对应的 queuedId', () => {
    const e = createRawInputResolved('queued-1');
    expect(e.kind).toBe('raw_input_resolved');
    if (e.kind !== 'raw_input_resolved') throw new Error('unreachable');
    expect(e.payload.queuedId).toBe('queued-1');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/events.test.ts`
Expected: FAIL，报 `createRawInputQueued`/`createRawInputResolved` 不存在（模块没有导出）。

- [ ] **Step 3: 实现（events.ts）**

在 `src/lib/ledger/events.ts` 里，把 `LedgerEvent` 的定义替换为（新增两个具名事件类型，其余三种保持原样不动）：

```typescript
export type RawInputQueuedPayload = {
  id: string;
  text: string;
  localTime: string;
  timeZone: string;
  defaultCurrency: string;
};

export type RawInputResolvedPayload = { queuedId: string };

type RawInputQueuedEvent = BaseEvent & {
  kind: 'raw_input_queued';
  payload: RawInputQueuedPayload;
};
type RawInputResolvedEvent = BaseEvent & {
  kind: 'raw_input_resolved';
  payload: RawInputResolvedPayload;
};

/** 判别字段用 kind 而非 type——Transaction 已经占用了 type 表示收支方向 */
export type LedgerEvent =
  | (BaseEvent & { kind: 'transaction_created'; payload: Transaction })
  | (BaseEvent & {
      kind: 'transaction_amended';
      payload: { id: string; changes: Partial<Omit<Transaction, 'id'>> };
    })
  | (BaseEvent & { kind: 'transaction_deleted'; payload: { id: string } })
  | RawInputQueuedEvent
  | RawInputResolvedEvent;
```

在文件末尾追加两个构造函数：

```typescript
/** 离线时的原始输入（spec §5.1、§9）：先落盘排队，联网后由 lib/ledger/offlineQueue.ts 补跑。 */
export function createRawInputQueued(
  input: Omit<RawInputQueuedPayload, 'id'>,
): RawInputQueuedEvent {
  return {
    ...base(),
    kind: 'raw_input_queued',
    payload: { id: crypto.randomUUID(), ...input },
  };
}

/** 标记某条排队输入已结构化完成（对应的 transaction_created 事件单独追加）。 */
export function createRawInputResolved(queuedId: string): RawInputResolvedEvent {
  return { ...base(), kind: 'raw_input_resolved', payload: { queuedId } };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 5: replay.ts 加穷尽性 case + 回归测试**

`LedgerEvent` 联合类型多了两个成员后，`src/lib/ledger/replay.ts` 里的 `switch (e.kind)` 会因为不穷尽而编译报错（`replay` 本身没有 `default` 分支）。在 `src/lib/ledger/replay.ts` 的 `switch` 里追加：

```typescript
      case 'raw_input_queued':
      case 'raw_input_resolved':
        // 不产生/修改任何 Transaction——这两种事件由 lib/ledger/store.ts 的
        // pendingRawInputsFrom() 单独从原始事件流里读取，不进入 replay 的
        // byId 累积逻辑（它们本来就不是 Transaction）。
        break;
```

在 `src/lib/ledger/__tests__/replay.test.ts` 追加一条回归测试（放在已有 `describe('replay', ...)` 块内）：

```typescript
it('raw_input_queued / raw_input_resolved 不影响 transactions（不是 Transaction 事件）', () => {
  const created = createTransactionCreated(tx);
  const queued = createRawInputQueued({
    text: 'x',
    localTime: '2026-09-05T10:00:00+10:00',
    timeZone: 'Australia/Sydney',
    defaultCurrency: 'AUD',
  });
  const resolved = createRawInputResolved('some-queued-id');
  const withExtra = replay([created, queued, resolved]);
  const without = replay([created]);
  expect(withExtra).toEqual(without);
});
```

对应在文件顶部的 import 里补上 `createRawInputQueued, createRawInputResolved`（沿用该文件已有的 `createTransactionCreated` 等导入方式）。

- [ ] **Step 6: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/replay.test.ts src/lib/ledger/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 7: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 错误（穷尽性检查通过）

```bash
git add src/lib/ledger/events.ts src/lib/ledger/replay.ts src/lib/ledger/__tests__/events.test.ts src/lib/ledger/__tests__/replay.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): 新增 raw_input_queued/raw_input_resolved 事件类型

离线队列的数据层基础（spec §5.1、§9）：离线时的原始文本先落这个事件，
联网后补跑 AI 再追加 transaction_created + raw_input_resolved。
不影响 replay() 的 Transaction 累积逻辑。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: store.ts——离线队列读写 + 事件快照导出

**Files:**
- Modify: `src/lib/ledger/store.ts`
- Test: `src/lib/ledger/__tests__/store.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `createRawInputQueued`、`createRawInputResolved`、`RawInputQueuedPayload`。
- Produces: `queueRawInput(input: Omit<RawInputQueuedPayload, 'id'>): Promise<string>`（返回排队项 id）、`resolveRawInput(queuedId: string, txs: Transaction[]): Promise<void>`、`pendingRawInputsFrom(events: LedgerEvent[]): RawInputQueuedPayload[]`（纯函数）、`pendingRawInputs(): RawInputQueuedPayload[]`（读当前内存事件的便捷包装，非响应式，供 Task 4 的补跑引擎用）、`getEventsSnapshot(): LedgerEvent[]`（稳定引用，供 Task 5 的 `usePendingRawInputs` hook 与 Task 11 的 `initSync` 用）。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/ledger/__tests__/store.test.ts` 末尾追加（沿用该文件已有的 `beforeEach(async () => { await clearAllEvents(); await hydrate(); })` 之类的既有 setup，不重复列出——直接加在同一个 `describe` 结构里或新开一个 `describe`）：

```typescript
import {
  queueRawInput,
  resolveRawInput,
  pendingRawInputsFrom,
  pendingRawInputs,
  getEventsSnapshot,
} from '@/lib/ledger/store';

describe('离线队列', () => {
  const ctx = {
    text: '买菜50块',
    localTime: '2026-09-05T10:00:00+10:00',
    timeZone: 'Australia/Sydney',
    defaultCurrency: 'AUD',
  };

  it('queueRawInput 落盘一个 raw_input_queued 事件并返回其 id', async () => {
    const id = await queueRawInput(ctx);
    expect(id).toBeTruthy();
    expect(pendingRawInputs()).toEqual([{ id, ...ctx }]);
  });

  it('resolveRawInput 后该条从 pendingRawInputs 消失，且对应账目已入账', async () => {
    const id = await queueRawInput(ctx);
    const tx: Transaction = {
      id: 'tx-from-queue',
      type: 'EXPENSE',
      amountCents: 5000,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: '买菜',
    };
    await resolveRawInput(id, [tx]);
    expect(pendingRawInputs()).toEqual([]);
    expect(getSnapshot().transactions.map((t) => t.id)).toContain('tx-from-queue');
  });

  it('resolveRawInput 允许空数组（AI 判定这句话不含收支信息）', async () => {
    const id = await queueRawInput(ctx);
    await resolveRawInput(id, []);
    expect(pendingRawInputs()).toEqual([]);
  });

  it('pendingRawInputsFrom 是纯函数：同一份事件多次调用返回值相等（可安全放进 useMemo 依赖）', () => {
    const events = getEventsSnapshot();
    expect(pendingRawInputsFrom(events)).toEqual(pendingRawInputsFrom(events));
  });

  it('getEventsSnapshot 在没有新事件时返回同一引用（同 getSnapshot 的稳定性规则，§6.6）', () => {
    const a = getEventsSnapshot();
    const b = getEventsSnapshot();
    expect(a).toBe(b);
  });

  it('getEventsSnapshot 在 append 后返回新引用', async () => {
    const before = getEventsSnapshot();
    await queueRawInput(ctx);
    expect(getEventsSnapshot()).not.toBe(before);
  });
});
```

在文件顶部按已有风格补上 `import type { Transaction } from '@/lib/ai/schema';`（如果该文件目前是从别处已经拿到 `Transaction` 类型，检查是否已导入，避免重复）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/store.test.ts`
Expected: FAIL，`queueRawInput` 等未导出。

- [ ] **Step 3: 实现**

在 `src/lib/ledger/store.ts` 顶部的 import 里，把：

```typescript
import {
  createTransactionCreated,
  createTransactionDeleted,
  type LedgerEvent,
} from '@/lib/ledger/events';
```

改成：

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

在 `removeTransaction` 函数后面追加：

```typescript
export async function queueRawInput(
  input: Omit<RawInputQueuedPayload, 'id'>,
): Promise<string> {
  const event = createRawInputQueued(input);
  await push([event]);
  return event.payload.id;
}

export async function resolveRawInput(
  queuedId: string,
  txs: Transaction[],
): Promise<void> {
  await push([...txs.map(createTransactionCreated), createRawInputResolved(queuedId)]);
}

/**
 * 纯函数：从一份事件序列里算出仍未结构化的排队输入。
 * 不在 getEventsSnapshot 里直接做这个筛选——那会导致每次调用返回新数组，
 * React 判定状态持续变化，无限重渲染（同 §6.6 对 getSnapshot 的规则）。
 * 筛选交给调用方（useMemo 或一次性读取）。
 */
export function pendingRawInputsFrom(events: LedgerEvent[]): RawInputQueuedPayload[] {
  const resolvedIds = new Set<string>();
  const queued = new Map<string, RawInputQueuedPayload>();
  for (const e of events) {
    if (e.kind === 'raw_input_queued') queued.set(e.payload.id, e.payload);
    else if (e.kind === 'raw_input_resolved') resolvedIds.add(e.payload.queuedId);
  }
  return [...queued.values()].filter((p) => !resolvedIds.has(p.id));
}

/** 非响应式的一次性读取，供不需要订阅更新的调用方用（如离线补跑引擎）。 */
export function pendingRawInputs(): RawInputQueuedPayload[] {
  return pendingRawInputsFrom(events);
}

/**
 * 原始事件数组的稳定快照，规则同 getSnapshot：不变更时必须返回同一引用。
 * 供需要访问“账本以外”信息（如待处理队列、Drive 同步要上传哪些事件）的
 * 上层代码使用——ledger/store.ts 本身对这些用途一无所知，只负责给出事实。
 */
export function getEventsSnapshot(): LedgerEvent[] {
  return events;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/store.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/ledger/store.ts src/lib/ledger/__tests__/store.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): store.ts 支持离线队列读写与原始事件快照

queueRawInput/resolveRawInput 是离线队列的写入面；getEventsSnapshot
让上层（sync/offlineQueue）能看到原始事件流而不用改动 ledger 的对外契约。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 提取 structureAndSave 共享逻辑，page.tsx 改用它

**Why:** `page.tsx` 的 `handleSubmit` 里内联了“fetch /api/structure → 校验 → 归一化商户 → 转成 Transaction”的完整流程。离线补跑（Task 4）需要一模一样的流程，复制一份会导致两处校验/归一化逻辑逐渐漂移——先抽出来，用现有的 `page.test.tsx`/`optimistic.test.tsx` 验证行为不变，再在其上面建离线队列。

**Files:**
- Create: `src/lib/ledger/structureAndSave.ts`
- Modify: `src/app/page.tsx`
- Test: `src/lib/ledger/__tests__/structureAndSave.test.ts`

**Interfaces:**
- Consumes: `throwApiError` (`@/lib/apiError`)、`AiResponseSchema`/`toTransaction` (`@/lib/ai/schema`)、`normalizeMerchant` (`@/lib/ledger/normalize`)、`knownMerchants` (`@/lib/ledger/store`)。
- Produces: `structureTextToTransactions(text: string, ctx: { localTime: string; timeZone: string; defaultCurrency: string }): Promise<Transaction[]>`——供 page.tsx 与 Task 4 的离线补跑引擎共用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/ledger/__tests__/structureAndSave.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';

const ctx = {
  localTime: '2026-09-05T10:00:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

afterEach(() => vi.unstubAllGlobals());

describe('structureTextToTransactions', () => {
  it('成功时把 AI 记录转成入库形态的 Transaction（金额转整数分、补默认币种）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 54.3,
              currency: null,
              date: '2026-09-05',
              category: 'FOOD',
              merchant: 'Woolworths',
              description: '买菜',
            },
          ],
        }),
      }),
    );
    const out = await structureTextToTransactions('Woolworths 买菜54块3', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amountCents).toBe(5430);
    expect(out[0].currency).toBe('AUD');
    expect(out[0].merchant).toBe('Woolworths');
  });

  it('AI 判定无收支信息时返回空数组', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    expect(await structureTextToTransactions('今天天气不错', ctx)).toEqual([]);
  });

  it('请求失败时抛出 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(structureTextToTransactions('买菜', ctx)).rejects.toThrow();
  });

  it('响应形状不合法时抛出（Zod 校验），不返回半成品数据', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: [{ type: 'EXPENSE' }] }), // 缺必填字段
      }),
    );
    await expect(structureTextToTransactions('买菜', ctx)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/structureAndSave.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/ledger/structureAndSave.ts`：

```typescript
import { toTransaction, AiResponseSchema, type Transaction } from '@/lib/ai/schema';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { knownMerchants } from '@/lib/ledger/store';
import { throwApiError } from '@/lib/apiError';

export type StructureRequestContext = {
  localTime: string;
  timeZone: string;
  defaultCurrency: string;
};

/**
 * 文本 → 入库形态的 Transaction[]。page.tsx 的在线提交与
 * lib/ledger/offlineQueue.ts 的联网后补跑共用这同一段逻辑，
 * 避免两处对 AI 响应的校验/商户归一化行为漂移。
 * 不在这里 addTransactions——写入时机由调用方决定（离线补跑还要
 * 同时追加 raw_input_resolved，见 store.ts 的 resolveRawInput）。
 */
export async function structureTextToTransactions(
  text: string,
  ctx: StructureRequestContext,
): Promise<Transaction[]> {
  const res = await fetch('/api/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, ...ctx }),
  });
  if (!res.ok) await throwApiError(res, '结构化失败');

  // 运行时校验，而非类型断言：写入不可变事件日志前的最后一道防线。
  const { records } = AiResponseSchema.parse(await res.json());
  const known = knownMerchants();
  return records.map((r) =>
    toTransaction(
      { ...r, merchant: normalizeMerchant(r.merchant, known) },
      { id: crypto.randomUUID(), defaultCurrency: ctx.defaultCurrency },
    ),
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/structureAndSave.test.ts`
Expected: PASS

- [ ] **Step 5: page.tsx 改用它**

把 `src/app/page.tsx` 里的：

```typescript
import { toTransaction, AiResponseSchema } from '@/lib/ai/schema';
```

删掉这一行以及 `normalizeMerchant`/`throwApiError` 的 import（改由 `structureAndSave.ts` 内部使用），改成：

```typescript
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';
```

`handleSubmit` 函数体从：

```typescript
  async function handleSubmit(text: string) {
    const pendingId = crypto.randomUUID();
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, { id: pendingId, text }]);
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
      if (!res.ok) await throwApiError(res, '结构化失败');

      // 运行时校验，而非类型断言：这是数据流里唯一会写入不可变事件日志的
      // 客户端边界，其它 provider 相关边界（providers/ 内）都已用同一 schema 校验过。
      // 校验失败会抛出 ZodError，走下面既有的 handleSubmit 失败路径
      // （占位行清除、Composer 显示失败提示、输入内容保留）。
      const { records } = AiResponseSchema.parse(await res.json());
      const known = knownMerchants();
      const txs = records.map((r) =>
        toTransaction(
          { ...r, merchant: normalizeMerchant(r.merchant, known) },
          { id: crypto.randomUUID(), defaultCurrency: DEFAULT_CURRENCY },
        ),
      );
      await addTransactions(txs);
      if (txs.length > 0) setLastAdded(txs.map((tx) => tx.id));
    } finally {
      setPending((p) => p.filter((entry) => entry.id !== pendingId));
    }
  }
```

改成：

```typescript
  async function handleSubmit(text: string) {
    const pendingId = crypto.randomUUID();
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, { id: pendingId, text }]);
    try {
      const ctx = {
        localTime: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultCurrency: DEFAULT_CURRENCY,
      };
      const txs = await structureTextToTransactions(text, ctx);
      await addTransactions(txs);
      if (txs.length > 0) setLastAdded(txs.map((tx) => tx.id));
    } finally {
      setPending((p) => p.filter((entry) => entry.id !== pendingId));
    }
  }
```

（离线分支留给 Task 5——这一步先只做等价提取，不改行为，用既有测试回归验证。）

`knownMerchants` 的 import 如果 `page.tsx` 别处不再用到就一并删掉；`addTransactions`/`removeTransaction` 等其它 import 保持不动。

- [ ] **Step 6: 跑既有回归测试确认行为不变**

Run: `npm test -- --run src/app/__tests__/page.test.tsx src/app/__tests__/page-guest.test.tsx src/app/__tests__/optimistic.test.tsx`
Expected: PASS（这三个文件此前覆盖的提交/失败/归并/乐观 UI 场景应该原样通过——如果有失败，说明提取过程中改变了行为，需要修正 `structureAndSave.ts` 或 `handleSubmit` 直到这些既有用例重新全绿，而不是修改这些测试本身）

- [ ] **Step 7: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 0 错误

```bash
git add src/lib/ledger/structureAndSave.ts src/lib/ledger/__tests__/structureAndSave.test.ts src/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(ledger): 提取 structureTextToTransactions 共享逻辑

page.tsx 的在线提交与即将实现的离线补跑（Task 4）需要同一段
"文本→AI→入库 Transaction"流程，抽出来避免两处漂移。
行为不变，由既有 page/optimistic 测试回归验证。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 离线自动补跑引擎

**Files:**
- Create: `src/lib/ledger/offlineQueue.ts`
- Test: `src/lib/ledger/__tests__/offlineQueue.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `pendingRawInputs`、`resolveRawInput`；Task 3 的 `structureTextToTransactions`。
- Produces: `retryPendingInputs(): Promise<void>`、`initOfflineQueueAutoRetry(): () => void`（返回取消订阅函数）——供 Task 5 的 page.tsx 调用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/ledger/__tests__/offlineQueue.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ledger/store', () => ({
  pendingRawInputs: vi.fn(),
  resolveRawInput: vi.fn(),
}));
vi.mock('@/lib/ledger/structureAndSave', () => ({
  structureTextToTransactions: vi.fn(),
}));

import { pendingRawInputs, resolveRawInput } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';
import { retryPendingInputs, initOfflineQueueAutoRetry } from '@/lib/ledger/offlineQueue';

const item = {
  id: 'q1',
  text: '买菜50块',
  localTime: '2026-09-05T10:00:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('retryPendingInputs', () => {
  it('对每条排队输入调用 structureTextToTransactions 并 resolveRawInput', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    vi.mocked(structureTextToTransactions).mockResolvedValue([]);
    await retryPendingInputs();
    expect(structureTextToTransactions).toHaveBeenCalledWith('买菜50块', {
      localTime: item.localTime,
      timeZone: item.timeZone,
      defaultCurrency: item.defaultCurrency,
    });
    expect(resolveRawInput).toHaveBeenCalledWith('q1', []);
  });

  it('某一条补跑失败不影响其它条目继续补跑', async () => {
    const item2 = { ...item, id: 'q2', text: '午餐20块' };
    vi.mocked(pendingRawInputs).mockReturnValue([item, item2]);
    vi.mocked(structureTextToTransactions)
      .mockRejectedValueOnce(new Error('网络还没真的通'))
      .mockResolvedValueOnce([]);
    await retryPendingInputs();
    expect(resolveRawInput).toHaveBeenCalledTimes(1);
    expect(resolveRawInput).toHaveBeenCalledWith('q2', []);
  });

  it('没有排队项时不调用任何补跑逻辑', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([]);
    await retryPendingInputs();
    expect(structureTextToTransactions).not.toHaveBeenCalled();
  });

  it('并发调用时后一次直接跳过，不重复补跑同一批（避免多个 online 事件抖动触发重复请求）', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    let resolveFirst: () => void = () => {};
    vi.mocked(structureTextToTransactions).mockReturnValue(
      new Promise((r) => {
        resolveFirst = () => r([]);
      }),
    );
    const first = retryPendingInputs();
    const second = retryPendingInputs();
    resolveFirst();
    await Promise.all([first, second]);
    expect(structureTextToTransactions).toHaveBeenCalledTimes(1);
  });
});

describe('initOfflineQueueAutoRetry', () => {
  it('注册 online 事件监听，触发时调用补跑', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([]);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const cleanup = initOfflineQueueAutoRetry();
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    cleanup();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/ledger/__tests__/offlineQueue.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/ledger/offlineQueue.ts`：

```typescript
import { pendingRawInputs, resolveRawInput } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';

let retrying = false;

/**
 * 补跑全部排队中的离线输入（spec §9：联网后自动补跑）。
 * 单条失败不中断其它条目——网络刚恢复时偶发的第一次请求失败很常见，
 * 保留在队列里，下次 online 事件或下次显式调用再试。
 */
export async function retryPendingInputs(): Promise<void> {
  if (retrying) return; // 避免并发的多个 online 事件重复补跑同一批
  retrying = true;
  try {
    for (const item of pendingRawInputs()) {
      try {
        const txs = await structureTextToTransactions(item.text, {
          localTime: item.localTime,
          timeZone: item.timeZone,
          defaultCurrency: item.defaultCurrency,
        });
        await resolveRawInput(item.id, txs);
      } catch {
        // 保留在队列里，不往上抛——一条补跑失败不该打断循环里其它条目
      }
    }
  } finally {
    retrying = false;
  }
}

/**
 * 应用启动时调用一次：监听 online 事件自动补跑；若启动时已经在线
 * （比如离线记了几笔、下次打开应用时网络已经恢复），立即补跑一次。
 * 返回取消订阅函数。
 */
export function initOfflineQueueAutoRetry(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => void retryPendingInputs();
  window.addEventListener('online', handler);
  if (navigator.onLine) void retryPendingInputs();
  return () => window.removeEventListener('online', handler);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/ledger/__tests__/offlineQueue.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/ledger/offlineQueue.ts src/lib/ledger/__tests__/offlineQueue.test.ts
git commit -m "$(cat <<'EOF'
feat(ledger): 离线队列自动补跑引擎

联网后（online 事件，或启动时已经在线）自动把 raw_input_queued
补跑成正式账目。单条失败不中断其它条目，并发触发时去重。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: page.tsx 接入离线分支 + 展示排队中的输入

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/QueuedRow.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/QueuedRow.test.tsx`
- Test: `src/app/__tests__/offline-queue.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 `queueRawInput`、`getEventsSnapshot`、`pendingRawInputsFrom`；Task 4 的 `initOfflineQueueAutoRetry`；`subscribe` from `@/lib/ledger/store`（既有导出）。
- Produces: `usePendingRawInputs(): RawInputQueuedPayload[]` hook（定义在 `src/lib/ledger/useLedger.ts`，与既有 `useLedger` 放一起，因为都是“账本状态 → React”的适配层）。

- [ ] **Step 1: 字典先加两个 key**

在 `src/lib/i18n/dictionary.ts` 的 `DictKey` 联合类型里加：

```typescript
  | 'queuedOffline'
```

`en` 字典加：

```typescript
  queuedOffline: 'Queued offline — will record once back online',
```

`zh` 字典加：

```typescript
  queuedOffline: '离线待处理，联网后自动记账',
```

- [ ] **Step 2: 写失败的测试（QueuedRow 组件）**

创建 `src/components/__tests__/QueuedRow.test.tsx`：

```typescript
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { QueuedRow } from '@/components/QueuedRow';

describe('QueuedRow', () => {
  it('显示原文与离线待处理提示', () => {
    render(<QueuedRow text="买菜50块" />);
    expect(screen.getByText('买菜50块')).toBeDefined();
    expect(screen.getByText(/Queued offline/)).toBeDefined();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/QueuedRow.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 4: 实现 QueuedRow**

创建 `src/components/QueuedRow.tsx`（结构照抄 `PendingRow.tsx`，文案不同——两者语义不同：`PendingRow` 是“提交瞬间到接口返回之间”的短暂状态，`QueuedRow` 是“离线排队中”的持久状态）：

```typescript
import { useLocale } from '@/lib/i18n/context';

export function QueuedRow({ text }: { text: string }) {
  const { t } = useLocale();
  return (
    <li aria-live="polite">
      <span>{text}</span>
      <span>{t('queuedOffline')}</span>
    </li>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/QueuedRow.test.tsx`
Expected: PASS

- [ ] **Step 6: useLedger.ts 加 usePendingRawInputs hook**

修改 `src/lib/ledger/useLedger.ts`，在文件末尾追加（沿用文件顶部已有的 `subscribe`/`useSyncExternalStore`/`useEffect` import，额外补 `useMemo`）：

```typescript
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  hydrate,
  getEventsSnapshot,
  pendingRawInputsFrom,
} from '@/lib/ledger/store';
import type { Ledger } from '@/lib/ledger/replay';
import type { RawInputQueuedPayload } from '@/lib/ledger/events';

const EMPTY: Ledger = { transactions: [] };
const EMPTY_EVENTS: RawInputQueuedPayload[] = [];

export function useLedger(): Ledger {
  useEffect(() => {
    void hydrate();
  }, []);
  // 服务端渲染时返回稳定的空账本，避免 hydration 不匹配
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/**
 * 离线队列里仍未结构化的输入。派生（筛选）在这里用 useMemo 做，
 * 不在 store 的 getSnapshot 里做——否则每次调用返回新数组，
 * React 判定状态持续变化，无限重渲染（spec §6.6 的既定规则）。
 */
export function usePendingRawInputs(): RawInputQueuedPayload[] {
  const events = useSyncExternalStore(subscribe, getEventsSnapshot, () => []);
  return useMemo(() => pendingRawInputsFrom(events), [events]) || EMPTY_EVENTS;
}
```

（最后的 `|| EMPTY_EVENTS` 只是保险；`pendingRawInputsFrom` 恒返回数组不会是 falsy，可以去掉——保留 `useMemo(() => pendingRawInputsFrom(events), [events])` 即可，删掉这个多余的 `||` 分支。）

- [ ] **Step 7: 写失败的测试（page.tsx 离线分支）**

创建 `src/app/__tests__/offline-queue.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});
afterEach(() => vi.restoreAllMocks());

describe('主屏 · 离线队列', () => {
  it('离线时提交不发请求，落入排队队列并显示待处理', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '买菜50块');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/Queued offline/)).toBeDefined());
    expect(screen.getByText('买菜50块')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('在线时提交行为不变（回归：不因为加了离线分支而破坏既有路径）', async () => {
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
              date: '2026-09-05',
              category: 'FOOD',
              merchant: null,
              description: '早餐',
            },
          ],
        }),
      }),
    );
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('-25.00')).toBeDefined());
    expect(screen.queryByText(/Queued offline/)).toBeNull();
  });
});
```

- [ ] **Step 8: 运行测试确认失败**

Run: `npm test -- --run src/app/__tests__/offline-queue.test.tsx`
Expected: FAIL（离线时当前实现仍会调用 `fetch`）。

- [ ] **Step 9: 实现——page.tsx 接入离线分支**

在 `src/app/page.tsx` 顶部 import 区加：

```typescript
import { queueRawInput } from '@/lib/ledger/store';
import { usePendingRawInputs } from '@/lib/ledger/useLedger';
import { QueuedRow } from '@/components/QueuedRow';
import { initOfflineQueueAutoRetry } from '@/lib/ledger/offlineQueue';
```

`useLedger()` 调用附近加一个新 hook 调用与一个 `useEffect`：

```typescript
  const pendingRawInputs = usePendingRawInputs();

  useEffect(() => {
    return initOfflineQueueAutoRetry();
  }, []);
```

（`useEffect` 已经在文件顶部从 `react` 导入，沿用既有 import，不重复添加。）

`handleSubmit` 里，`const ctx = {...}` 之后、调用 `structureTextToTransactions` 之前，加离线分支：

```typescript
  async function handleSubmit(text: string) {
    const pendingId = crypto.randomUUID();
    setPending((p) => [...p, { id: pendingId, text }]);
    try {
      const ctx = {
        localTime: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultCurrency: DEFAULT_CURRENCY,
      };
      if (!navigator.onLine) {
        await queueRawInput({ text, ...ctx });
        return; // 离线：不乐观插入账目，只排队等待联网后补跑（spec §9、§11.4）
      }
      const txs = await structureTextToTransactions(text, ctx);
      await addTransactions(txs);
      if (txs.length > 0) setLastAdded(txs.map((tx) => tx.id));
    } finally {
      setPending((p) => p.filter((entry) => entry.id !== pendingId));
    }
  }
```

在 JSX 里，紧跟 `pending.length > 0 && (...)` 那个 `<ul>` 之后，加排队列表：

```typescript
      {pendingRawInputs.length > 0 && (
        <ul>
          {pendingRawInputs.map((item) => (
            <QueuedRow key={item.id} text={item.text} />
          ))}
        </ul>
      )}
```

- [ ] **Step 10: 运行测试确认通过**

Run: `npm test -- --run src/app/__tests__/offline-queue.test.tsx`
Expected: PASS

- [ ] **Step 11: 跑全量回归**

Run: `npm test -- --run`
Expected: 全部通过（含 Task 3 提取后的既有 page/optimistic 测试）

- [ ] **Step 12: 提交**

```bash
git add src/app/page.tsx src/components/QueuedRow.tsx src/components/__tests__/QueuedRow.test.tsx src/lib/ledger/useLedger.ts src/lib/i18n/dictionary.ts src/app/__tests__/offline-queue.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): 离线提交进队列，联网后自动补跑并展示排队状态

navigator.onLine 为 false 时不发请求，写 raw_input_queued 并在
列表里显示"离线待处理"；应用启动时挂载自动补跑监听。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: oauth.ts——refreshAccessToken

**Files:**
- Modify: `src/lib/auth/oauth.ts`
- Test: `src/lib/auth/__tests__/oauth.test.ts`

**Interfaces:**
- Produces: `refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }>`——供 Task 7 的 `/api/drive-token` 路由使用。

- [ ] **Step 1: 写失败的测试**

在 `src/lib/auth/__tests__/oauth.test.ts` 末尾追加（沿用文件已有的 `beforeEach`/`afterEach` 对 `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` 的 `vi.stubEnv`，不用重复写）：

```typescript
describe('refreshAccessToken', () => {
  it('用 refresh_token grant 换取 access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'at-1', expires_in: 3599 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    const out = await refreshAccessToken('rt-1');
    expect(out).toEqual({ accessToken: 'at-1', expiresIn: 3599 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-1');
    expect(body.get('client_id')).toBe('client-1');
  });

  it('HTTP 失败时抛错，不泄漏 refresh token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400 }));
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    await expect(refreshAccessToken('secret-rt')).rejects.toThrow(/400/);
    await expect(refreshAccessToken('secret-rt')).rejects.not.toThrow(/secret-rt/);
  });

  it('响应缺少 access_token 时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    await expect(refreshAccessToken('rt-1')).rejects.toThrow(/access_token/);
  });

  it('响应缺少 expires_in 时回退到 3600 秒', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'at-1' }) }),
    );
    const { refreshAccessToken } = await import('@/lib/auth/oauth');
    expect((await refreshAccessToken('rt-1')).expiresIn).toBe(3600);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/auth/__tests__/oauth.test.ts`
Expected: FAIL，`refreshAccessToken` 未导出。

- [ ] **Step 3: 实现**

在 `src/lib/auth/oauth.ts` 末尾追加：

```typescript
/**
 * 用 refresh token 换一个短期 access token（spec §11.3 令牌流的核心动作）。
 * 只在服务端调用——refresh token 从不进入浏览器。
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { id, secret } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token 刷新失败：HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google 刷新响应缺少 access_token');
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/auth/__tests__/oauth.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/auth/oauth.ts src/lib/auth/__tests__/oauth.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): refreshAccessToken——refresh_token 换短期 access token

spec §11.3 令牌流的最后一块：/api/drive-token 路由（下一个 task）
用它把加密落库的 refresh token 换成浏览器可以直接拿去调 Drive API 的
短期 access token。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `/api/drive-token` 路由

**Files:**
- Modify: `src/lib/server/user.ts`
- Create: `src/app/api/drive-token/route.ts`
- Test: `src/lib/server/__tests__/user.test.ts`
- Test: `src/app/api/drive-token/__tests__/route.test.ts`

**Interfaces:**
- Consumes: Task 6 的 `refreshAccessToken`；既有的 `authenticate` (`@/lib/server/guard`)、`decryptRefreshToken` (`@/lib/server/crypto`)。
- Produces: `userRepo.getRefreshTokenEnc(googleSub: string): Promise<string | null>`；`POST /api/drive-token` 返回 `{ accessToken: string; expiresIn: number }`，失败时 `{ error: string; code: 'UNAUTHENTICATED' | 'DRIVE_NOT_LINKED' | 'DRIVE_REAUTH_REQUIRED' }`——供 Task 10 的 `lib/sync/engine.ts` 消费其中的 `code`。

- [ ] **Step 1: 写失败的测试（user.ts 新函数）**

检查 `src/lib/server/__tests__/user.test.ts` 是否已存在（Plan 2 应该建过），在其中追加（若文件不存在则创建，import 方式沿用该文件其它用例已有的 `makeUserRepo` 测试模式）：

```typescript
describe('getRefreshTokenEnc', () => {
  it('返回该用户的加密 refresh token', async () => {
    const db = {
      user: {
        upsert: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({ refreshTokenEnc: 'enc-blob' }),
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
      },
    };
    const repo = makeUserRepo(db);
    expect(await repo.getRefreshTokenEnc('sub-none')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/server/__tests__/user.test.ts`
Expected: FAIL，`getRefreshTokenEnc` 不存在 / `db.user.findUnique` 类型不匹配。

- [ ] **Step 3: 实现（user.ts）**

修改 `src/lib/server/user.ts` 的 `DbLike` 类型：

```typescript
type DbLike = {
  user: {
    upsert(args: UpsertArgs): Promise<UserRow>;
    findUnique(args: {
      where: { googleSub: string };
    }): Promise<{ refreshTokenEnc: string | null } | null>;
  };
};
```

在 `makeUserRepo` 返回的对象里，`findOrCreateUser` 旁边加：

```typescript
    async getRefreshTokenEnc(googleSub: string): Promise<string | null> {
      const row = await db.user.findUnique({ where: { googleSub } });
      return row?.refreshTokenEnc ?? null;
    },
```

`defaultDb.user` 里补上真实实现：

```typescript
    findUnique: (args) =>
      prisma.user.findUnique({
        where: args.where,
        select: { refreshTokenEnc: true },
      }),
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/server/__tests__/user.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败的测试（路由）**

创建 `src/app/api/drive-token/__tests__/route.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { getRefreshTokenEnc: vi.fn() },
}));
vi.mock('@/lib/server/crypto', () => ({ decryptRefreshToken: vi.fn() }));
vi.mock('@/lib/auth/oauth', () => ({ refreshAccessToken: vi.fn() }));

import { POST } from '@/app/api/drive-token/route';
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';
import { decryptRefreshToken } from '@/lib/server/crypto';
import { refreshAccessToken } from '@/lib/auth/oauth';

const USER = { googleSub: 's1', email: null, name: null, picture: null };
const req = () => new Request('http://localhost/api/drive-token', { method: 'POST' });

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.getRefreshTokenEnc).mockResolvedValue('enc-blob');
  vi.mocked(decryptRefreshToken).mockReturnValue('plain-refresh-token');
  vi.mocked(refreshAccessToken).mockResolvedValue({ accessToken: 'at-1', expiresIn: 3599 });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/drive-token', () => {
  it('已登录且已授权 Drive → 返回 access token', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accessToken: 'at-1', expiresIn: 3599 });
  });

  it('未登录 → 401，不查库也不调 Google', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录', code: 'UNAUTHENTICATED' } },
    });
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(userRepo.getRefreshTokenEnc).not.toHaveBeenCalled();
  });

  it('bypass 逃生舱 → 400，Drive 同步不支持这种模式', async () => {
    vi.mocked(authenticate).mockResolvedValue({ bypass: true } as never);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('DRIVE_NOT_LINKED');
  });

  it('用户从未拿到过 refresh token → 400 DRIVE_NOT_LINKED，不调 Google', async () => {
    vi.mocked(userRepo.getRefreshTokenEnc).mockResolvedValue(null);
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('DRIVE_NOT_LINKED');
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it('刷新失败（token 已被用户在 Google 后台撤销等）→ 401 DRIVE_REAUTH_REQUIRED', async () => {
    vi.mocked(refreshAccessToken).mockRejectedValue(new Error('Google token 刷新失败：HTTP 400'));
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('DRIVE_REAUTH_REQUIRED');
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npm test -- --run src/app/api/drive-token/__tests__/route.test.ts`
Expected: FAIL，路由文件不存在。

- [ ] **Step 7: 实现路由**

创建 `src/app/api/drive-token/route.ts`：

```typescript
import { authenticate } from '@/lib/server/guard';
import { userRepo } from '@/lib/server/user';
import { decryptRefreshToken } from '@/lib/server/crypto';
import { refreshAccessToken } from '@/lib/auth/oauth';

export const runtime = 'nodejs';

/**
 * POST /api/drive-token —— refresh token 换短期 access token（spec §11.3）。
 * 账本内容不经过这个路由：它只吐出一个 access token，浏览器拿着这个
 * token 直接去调 Google Drive API（见 lib/sync/drive.ts）。
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }
  if ('bypass' in auth) {
    return Response.json(
      { error: '逃生舱模式不支持 Drive 同步', code: 'DRIVE_NOT_LINKED' },
      { status: 400 },
    );
  }

  const enc = await userRepo.getRefreshTokenEnc(auth.googleSub);
  if (!enc) {
    return Response.json(
      { error: '尚未授权 Drive 访问，请重新登录', code: 'DRIVE_NOT_LINKED' },
      { status: 400 },
    );
  }

  try {
    const refreshToken = decryptRefreshToken(enc);
    const { accessToken, expiresIn } = await refreshAccessToken(refreshToken);
    return Response.json({ accessToken, expiresIn });
  } catch (err) {
    // 零内容日志（§10.5 原则的延伸）：只记错误类型，不带 token 内容
    console.error(
      JSON.stringify({
        route: 'drive-token',
        ok: false,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json(
      { error: 'Drive 授权已失效，请重新登录', code: 'DRIVE_REAUTH_REQUIRED' },
      { status: 401 },
    );
  }
}
```

- [ ] **Step 8: 运行测试确认通过**

Run: `npm test -- --run src/app/api/drive-token/__tests__/route.test.ts`
Expected: PASS

- [ ] **Step 9: 类型检查 + 提交**

Run: `npx tsc --noEmit`

```bash
git add src/lib/server/user.ts src/lib/server/__tests__/user.test.ts src/app/api/drive-token/route.ts src/app/api/drive-token/__tests__/route.test.ts
git commit -m "$(cat <<'EOF'
feat(api): /api/drive-token——refresh token 换 access token 端点

区分三种失败：未登录（401 UNAUTHENTICATED，复用既有 guard）、
从未拿到过 refresh token（400 DRIVE_NOT_LINKED）、刷新失败即授权
已失效（401 DRIVE_REAUTH_REQUIRED）——后两者驱动 sync/engine.ts
判定 A 类失败并提示用户重新登录（spec §8.3）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `lib/sync/drive.ts`——appDataFolder 读写

**Files:**
- Create: `src/lib/sync/drive.ts`
- Test: `src/lib/sync/__tests__/drive.test.ts`

**Interfaces:**
- Consumes: `LedgerEvent` (`@/lib/ledger/events`)。
- Produces: `type DriveFile = { id: string; name: string }`、`listOwnAppFiles(accessToken: string): Promise<DriveFile[]>`、`downloadFile(accessToken: string, fileId: string): Promise<string>`、`upsertOwnFile(accessToken: string, deviceId: string, content: string): Promise<void>`、`serializeEvents(events: LedgerEvent[]): string`、`parseEvents(content: string): LedgerEvent[]`——供 Task 10 的 `lib/sync/engine.ts` 使用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/sync/__tests__/drive.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listOwnAppFiles,
  downloadFile,
  upsertOwnFile,
  serializeEvents,
  parseEvents,
} from '@/lib/sync/drive';
import { createTransactionCreated } from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
};

afterEach(() => vi.unstubAllGlobals());

describe('serializeEvents / parseEvents', () => {
  it('往返一致（JSONL：一行一个事件）', () => {
    const events = [createTransactionCreated(tx)];
    expect(parseEvents(serializeEvents(events))).toEqual(events);
  });

  it('parseEvents 忽略空行', () => {
    const events = [createTransactionCreated(tx)];
    const withBlankLines = `\n${serializeEvents(events)}\n\n`;
    expect(parseEvents(withBlankLines)).toEqual(events);
  });

  it('空事件列表序列化为空字符串，解析回空数组', () => {
    expect(serializeEvents([])).toBe('');
    expect(parseEvents('')).toEqual([]);
  });
});

describe('listOwnAppFiles', () => {
  it('请求 appDataFolder 并解析 files 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ id: 'f1', name: 'events-d1.jsonl' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const files = await listOwnAppFiles('at-1');
    expect(files).toEqual([{ id: 'f1', name: 'events-d1.jsonl' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('spaces=appDataFolder');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
  });

  it('响应没有 files 字段时返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await listOwnAppFiles('at-1')).toEqual([]);
  });

  it('HTTP 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(listOwnAppFiles('at-1')).rejects.toThrow(/401/);
  });
});

describe('downloadFile', () => {
  it('用 alt=media 下载原始内容', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'raw-content' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadFile('at-1', 'f1')).toBe('raw-content');
    expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
  });

  it('HTTP 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(downloadFile('at-1', 'missing')).rejects.toThrow(/404/);
  });
});

describe('upsertOwnFile', () => {
  it('文件不存在时用 multipart 创建', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('spaces=appDataFolder')) {
        return Promise.resolve({ ok: true, json: async () => ({ files: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'new-file-id' }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await upsertOwnFile('at-1', 'device-1', 'line1\nline2');
    const createCall = fetchMock.mock.calls.find(([url]: [string]) =>
      url.includes('uploadType=multipart'),
    );
    expect(createCall).toBeDefined();
    const [url, init] = createCall as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files/);
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('events-device-1.jsonl');
    expect(String(init.body)).toContain('line1\nline2');
  });

  it('文件已存在时用 PATCH 覆盖内容，不重新创建', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('spaces=appDataFolder')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ files: [{ id: 'existing-id', name: 'events-device-1.jsonl' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await upsertOwnFile('at-1', 'device-1', 'new-content');
    const updateCall = fetchMock.mock.calls.find(
      ([, init]: [string, RequestInit]) => init?.method === 'PATCH',
    );
    expect(updateCall).toBeDefined();
    const [url, init] = updateCall as [string, RequestInit];
    expect(url).toContain('existing-id');
    expect(init.body).toBe('new-content');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/sync/__tests__/drive.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/sync/drive.ts`：

```typescript
import type { LedgerEvent } from '@/lib/ledger/events';

const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const BOUNDARY = 'justsayit-sync-boundary';

export type DriveFile = { id: string; name: string };

/** 事件序列 → JSONL（一行一个事件），供写入 Drive 文件。 */
export function serializeEvents(events: LedgerEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n');
}

/** JSONL → 事件序列。忽略空行（文件末尾换行、手工拼接产生的空行等）。 */
export function parseEvents(content: string): LedgerEvent[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LedgerEvent);
}

export async function listOwnAppFiles(accessToken: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    pageSize: '1000',
  });
  const res = await fetch(`${FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive 列表请求失败：HTTP ${res.status}`);
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

export async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES_ENDPOINT}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive 下载失败：HTTP ${res.status}`);
  return res.text();
}

async function createFile(
  accessToken: string,
  name: string,
  content: string,
): Promise<void> {
  const metadata = JSON.stringify({ name, parents: ['appDataFolder'] });
  const body =
    `--${BOUNDARY}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${BOUNDARY}\r\n` +
    'Content-Type: text/plain\r\n\r\n' +
    `${content}\r\n` +
    `--${BOUNDARY}--`;
  const res = await fetch(`${UPLOAD_ENDPOINT}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': `multipart/related; boundary=${BOUNDARY}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive 创建文件失败：HTTP ${res.status}`);
}

async function updateFile(
  accessToken: string,
  fileId: string,
  content: string,
): Promise<void> {
  const res = await fetch(`${UPLOAD_ENDPOINT}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'text/plain',
    },
    body: content,
  });
  if (!res.ok) throw new Error(`Drive 更新文件失败：HTTP ${res.status}`);
}

/**
 * 写入本设备的日志文件（spec §7：每设备只写自己的文件，逻辑上只追加）。
 * content 是该设备迄今全部事件的完整序列化内容，不是增量——这个数据量级
 * 下（spec §6.1：五年约 3.6MB）整份覆盖比维护续写游标简单得多，也没有
 * 丢字节的风险。先查有没有已存在的同名文件，有则 PATCH 覆盖，没有则新建。
 */
export async function upsertOwnFile(
  accessToken: string,
  deviceId: string,
  content: string,
): Promise<void> {
  const name = `events-${deviceId}.jsonl`;
  const existing = await listOwnAppFiles(accessToken);
  const found = existing.find((f) => f.name === name);
  if (found) {
    await updateFile(accessToken, found.id, content);
  } else {
    await createFile(accessToken, name, content);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/sync/__tests__/drive.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc --noEmit`

```bash
git add src/lib/sync/drive.ts src/lib/sync/__tests__/drive.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): Drive appDataFolder 读写（浏览器直连 Google，不经后端）

listOwnAppFiles/downloadFile/upsertOwnFile 三个原语，外加事件的
JSONL 序列化/解析。upsertOwnFile 是"查是否已存在同名文件→有则
PATCH 覆盖、没有则 multipart 创建"，每次同步整份覆盖本设备文件
（spec §7、§6.1 数据量级下的合理简化）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `lib/sync/status.ts`——同步状态与分级预警的状态机

**Files:**
- Create: `src/lib/sync/status.ts`
- Test: `src/lib/sync/__tests__/status.test.ts`

**Interfaces:**
- Produces: `type SyncState = { unsyncedIds: string[]; firstUnsyncedAt: string | null; authError: boolean; lastSyncedAt: string | null }`、`subscribe(fn: () => void): () => void`、`getSnapshot(): SyncState`、`markUnsynced(ids: string[]): void`、`markSynced(ids: string[]): void`、`markAuthError(): void`、`clearAuthError(): void`、`type BTier = 'ok' | 'lt24h' | '24to72h' | 'gt72h'`、`classifyBTier(state: SyncState, now?: Date): BTier`——供 Task 10 (`engine.ts`)、Task 11 (`init.ts`)、Task 12/13/14 的 UI 组件消费。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/sync/__tests__/status.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  subscribe,
  getSnapshot,
  markUnsynced,
  markSynced,
  markAuthError,
  clearAuthError,
  classifyBTier,
} from '@/lib/sync/status';

beforeEach(() => {
  // 每个用例前重置到干净状态——直接把已知的未同步 id 全部标记为已同步
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
});

describe('markUnsynced / markSynced', () => {
  it('markUnsynced 加入未同步集合并通知订阅者', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    markUnsynced(['tx1', 'tx2']);
    expect(getSnapshot().unsyncedIds).toEqual(expect.arrayContaining(['tx1', 'tx2']));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('markUnsynced 首次调用时记录 firstUnsyncedAt', () => {
    expect(getSnapshot().firstUnsyncedAt).toBeNull();
    markUnsynced(['tx1']);
    expect(getSnapshot().firstUnsyncedAt).not.toBeNull();
  });

  it('markSynced 清空对应 id，全部清空后 firstUnsyncedAt 重置为 null', () => {
    markUnsynced(['tx1', 'tx2']);
    markSynced(['tx1']);
    expect(getSnapshot().unsyncedIds).toEqual(['tx2']);
    expect(getSnapshot().firstUnsyncedAt).not.toBeNull();
    markSynced(['tx2']);
    expect(getSnapshot().unsyncedIds).toEqual([]);
    expect(getSnapshot().firstUnsyncedAt).toBeNull();
  });

  it('markSynced 成功会清掉 authError（一次成功同步说明授权恢复正常）', () => {
    markAuthError();
    markUnsynced(['tx1']);
    markSynced(['tx1']);
    expect(getSnapshot().authError).toBe(false);
  });

  it('markSynced 更新 lastSyncedAt', () => {
    expect(getSnapshot().lastSyncedAt).toBeNull();
    markUnsynced(['tx1']);
    markSynced(['tx1']);
    expect(getSnapshot().lastSyncedAt).not.toBeNull();
  });
});

describe('markAuthError / clearAuthError', () => {
  it('markAuthError 置位，clearAuthError 复位', () => {
    markAuthError();
    expect(getSnapshot().authError).toBe(true);
    clearAuthError();
    expect(getSnapshot().authError).toBe(false);
  });
});

describe('classifyBTier', () => {
  const base = { unsyncedIds: ['tx1'], authError: false, lastSyncedAt: null };

  it('没有未同步项时是 ok', () => {
    expect(classifyBTier({ ...base, unsyncedIds: [], firstUnsyncedAt: null })).toBe('ok');
  });

  it('未满 24 小时是 lt24h', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    const firstUnsyncedAt = new Date('2026-09-05T00:00:01Z').toISOString();
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('lt24h');
  });

  it('恰好 24 小时进入 24to72h（边界含 24h）', () => {
    const firstUnsyncedAt = new Date('2026-09-04T00:00:00Z').toISOString();
    const now = new Date('2026-09-05T00:00:00Z'); // 恰好 24h
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('24to72h');
  });

  it('24-72 小时之间是 24to72h', () => {
    const firstUnsyncedAt = new Date('2026-09-01T00:00:00Z').toISOString();
    const now = new Date('2026-09-02T12:00:00Z'); // 36h
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('24to72h');
  });

  it('恰好 72 小时及以上进入 gt72h', () => {
    const firstUnsyncedAt = new Date('2026-09-01T00:00:00Z').toISOString();
    const now = new Date('2026-09-04T00:00:00Z'); // 恰好 72h
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('gt72h');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/sync/__tests__/status.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/sync/status.ts`：

```typescript
export type SyncState = {
  /** 已知写入本地、尚未确认同步到 Drive 的 transaction id 集合 */
  unsyncedIds: string[];
  /** 首次进入"有未同步项"状态的时间，用于 B 类分级计时（spec §8.4） */
  firstUnsyncedAt: string | null;
  /** A 类失败标记（spec §8.3）：授权失效/撤销、Drive API 拒绝等，不看时间，立刻提示 */
  authError: boolean;
  lastSyncedAt: string | null;
};

let state: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot(): SyncState {
  return state;
}

export function markUnsynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.add(id);
  state = {
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: state.firstUnsyncedAt ?? new Date().toISOString(),
  };
  emit();
}

export function markSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.delete(id);
  state = {
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: next.size === 0 ? null : state.firstUnsyncedAt,
    authError: false, // 一次成功同步说明授权是好的
    lastSyncedAt: new Date().toISOString(),
  };
  emit();
}

export function markAuthError(): void {
  state = { ...state, authError: true };
  emit();
}

export function clearAuthError(): void {
  state = { ...state, authError: false };
  emit();
}

export type BTier = 'ok' | 'lt24h' | '24to72h' | 'gt72h';

/**
 * B 类（网络不可用）的时间分级（spec §8.4）：<24h 不打扰、24–72h 持久横幅、
 * >72h 模态。A 类失败（authError）不受这个分级影响，由调用方单独判断、
 * 立刻提示（spec §8.3："不设时间阈值"）。
 */
export function classifyBTier(state: SyncState, now: Date = new Date()): BTier {
  if (state.unsyncedIds.length === 0 || !state.firstUnsyncedAt) return 'ok';
  const hours = (now.getTime() - new Date(state.firstUnsyncedAt).getTime()) / 3_600_000;
  if (hours < 24) return 'lt24h';
  if (hours < 72) return '24to72h';
  return 'gt72h';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/sync/__tests__/status.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/lib/sync/status.ts src/lib/sync/__tests__/status.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): 同步状态机——未同步集合、A/B 类失败、B 类时间分级

spec §8.3-8.4 的状态判定逻辑独立成纯状态模块：markUnsynced/
markSynced 维护未同步 transaction id 集合与首次未同步时间；
classifyBTier 按 24h/72h 阈值分级；markAuthError 标记 A 类失败，
不受时间分级影响，由调用方立刻提示。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `lib/sync/engine.ts`——同步编排

**Files:**
- Create: `src/lib/sync/engine.ts`
- Test: `src/lib/sync/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: Task 8 的 `listOwnAppFiles`/`downloadFile`/`upsertOwnFile`/`serializeEvents`/`parseEvents`；Task 9 的 `markUnsynced`/`markSynced`/`markAuthError`；既有的 `getDeviceId` (`@/lib/ledger/events`)、`readAllEvents`/`appendEvents` (`@/lib/ledger/db`)、`hydrate` (`@/lib/ledger/store`)；`ApiError`/`throwApiError` (`@/lib/apiError`)。
- Produces: `syncNow(): Promise<void>`——供 Task 11 (`init.ts`) 与 Task 14（"重试同步"按钮）调用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/sync/__tests__/engine.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/sync/drive', () => ({
  listOwnAppFiles: vi.fn(),
  downloadFile: vi.fn(),
  upsertOwnFile: vi.fn(),
  serializeEvents: vi.fn((events: unknown[]) => JSON.stringify(events)),
  parseEvents: vi.fn(),
}));
vi.mock('@/lib/sync/status', () => ({
  markUnsynced: vi.fn(),
  markSynced: vi.fn(),
  markAuthError: vi.fn(),
}));
vi.mock('@/lib/ledger/db', () => ({
  readAllEvents: vi.fn(),
  appendEvents: vi.fn(),
}));
vi.mock('@/lib/ledger/store', () => ({ hydrate: vi.fn() }));
vi.mock('@/lib/ledger/events', () => ({ getDeviceId: vi.fn(() => 'device-1') }));

import { syncNow } from '@/lib/sync/engine';
import { listOwnAppFiles, downloadFile, upsertOwnFile, parseEvents } from '@/lib/sync/drive';
import { markSynced, markAuthError } from '@/lib/sync/status';
import { readAllEvents, appendEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

const ownEvent = { eventId: 'e1', deviceId: 'device-1', kind: 'transaction_created' };
const otherDeviceEvent = { eventId: 'e2', deviceId: 'device-2', kind: 'transaction_created' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'at-1', expiresIn: 3599 }),
    }),
  );
  vi.mocked(readAllEvents).mockResolvedValue([ownEvent] as never);
  vi.mocked(listOwnAppFiles).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());

describe('syncNow', () => {
  it('上传本设备事件、标记已同步，没有其它设备文件时不下载', async () => {
    await syncNow();
    expect(upsertOwnFile).toHaveBeenCalledWith('at-1', 'device-1', expect.any(String));
    expect(markSynced).toHaveBeenCalledWith(['e1']);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(appendEvents).not.toHaveBeenCalled();
  });

  it('下载其它设备文件并合并进本地，不下载自己的文件', async () => {
    vi.mocked(listOwnAppFiles).mockResolvedValue([
      { id: 'own-file', name: 'events-device-1.jsonl' },
      { id: 'other-file', name: 'events-device-2.jsonl' },
    ]);
    vi.mocked(downloadFile).mockResolvedValue('raw-content');
    vi.mocked(parseEvents).mockReturnValue([otherDeviceEvent] as never);

    await syncNow();

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith('at-1', 'other-file');
    expect(appendEvents).toHaveBeenCalledWith([otherDeviceEvent]);
    expect(hydrate).toHaveBeenCalled();
  });

  it('拿 access token 失败（DRIVE_REAUTH_REQUIRED）→ markAuthError，不清未同步标记', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'x', code: 'DRIVE_REAUTH_REQUIRED' }),
      }),
    );
    await expect(syncNow()).rejects.toThrow();
    expect(markAuthError).toHaveBeenCalled();
    expect(markSynced).not.toHaveBeenCalled();
  });

  it('网络错误（B 类）不调用 markAuthError，错误照常往上抛给调用方', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(syncNow()).rejects.toThrow();
    expect(markAuthError).not.toHaveBeenCalled();
  });

  it('并发调用时后一次直接跳过', async () => {
    const first = syncNow();
    const second = syncNow();
    await Promise.all([first, second]);
    expect(upsertOwnFile).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/sync/__tests__/engine.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/sync/engine.ts`：

```typescript
import { getDeviceId } from '@/lib/ledger/events';
import { readAllEvents, appendEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';
import {
  listOwnAppFiles,
  downloadFile,
  upsertOwnFile,
  serializeEvents,
  parseEvents,
} from '@/lib/sync/drive';
import { markSynced, markAuthError } from '@/lib/sync/status';
import { ApiError, throwApiError } from '@/lib/apiError';

const AUTH_ERROR_CODES = new Set(['DRIVE_REAUTH_REQUIRED', 'DRIVE_NOT_LINKED']);

async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/drive-token', { method: 'POST' });
  if (!res.ok) await throwApiError(res, '获取 Drive 访问令牌失败');
  const data = (await res.json()) as { accessToken?: string };
  if (!data.accessToken) throw new Error('Drive 访问令牌响应缺少 accessToken');
  return data.accessToken;
}

let syncing = false;

/**
 * 一次完整的同步（spec §7）：
 * 1. 上传本设备迄今全部事件（整份覆盖，见 lib/sync/drive.ts 的说明）
 * 2. 列出 appDataFolder 里其它设备的文件，逐个下载
 * 3. 按 eventId 去重合并进本地 IndexedDB（复用 db.ts 既有的去重逻辑）
 * 4. 重新全量重放，让新合并进来的事件反映到账本状态里
 *
 * A 类失败（drive-token 返回 DRIVE_REAUTH_REQUIRED/DRIVE_NOT_LINKED）
 * 标记 authError，不清未同步集合；其它错误（网络不可用等）视为 B 类，
 * 同样不清未同步集合，交给调用方（init.ts/UI 的重试按钮）决定何时重试。
 */
export async function syncNow(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (err) {
      if (err instanceof ApiError && err.code && AUTH_ERROR_CODES.has(err.code)) {
        markAuthError();
      }
      throw err;
    }

    const deviceId = getDeviceId();
    const allLocalEvents = await readAllEvents();
    const ownEvents = allLocalEvents.filter((e) => e.deviceId === deviceId);

    await upsertOwnFile(accessToken, deviceId, serializeEvents(ownEvents));
    markSynced(ownEvents.map((e) => e.eventId));

    const files = await listOwnAppFiles(accessToken);
    const ownFileName = `events-${deviceId}.jsonl`;
    const otherFiles = files.filter((f) => f.name !== ownFileName && f.name.startsWith('events-'));

    if (otherFiles.length > 0) {
      const remoteEvents = (
        await Promise.all(otherFiles.map((f) => downloadFile(accessToken, f.id)))
      ).flatMap(parseEvents);
      if (remoteEvents.length > 0) {
        await appendEvents(remoteEvents); // 已按 eventId 去重（db.ts 既有逻辑）
        await hydrate();
      }
    }
  } finally {
    syncing = false;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/sync/__tests__/engine.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查 + 提交**

Run: `npx tsc --noEmit`

```bash
git add src/lib/sync/engine.ts src/lib/sync/__tests__/engine.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): 同步编排——上传本设备、下载合并其它设备、全量重放

拿 access token 失败且 code 是 DRIVE_REAUTH_REQUIRED/DRIVE_NOT_LINKED
时标记 A 类失败；其它失败（网络等）视为 B 类，都不清未同步集合，
交给上层决定何时重试。并发调用去重。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `lib/sync/init.ts`——订阅账本变化触发同步

**Files:**
- Create: `src/lib/sync/init.ts`
- Modify: `src/app/page.tsx`
- Test: `src/lib/sync/__tests__/init.test.ts`

**Why 单独一个模块而不是改 `ledger/store.ts`：** `lib/ledger/` 必须对 Drive/同步完全无感知（Global Constraints）。如果在 `store.ts` 的 `push()` 里直接 import `sync/engine.ts`，而 `engine.ts` 又要 import `store.ts` 的 `hydrate`，会形成循环依赖。`init.ts` 单向依赖两边、由 app 层显式挂载，两个模块之间没有反向引用。

**Files:**
- Consumes: 既有的 `subscribe`/`getEventsSnapshot` (`@/lib/ledger/store`)；Task 9 的 `markUnsynced`；Task 10 的 `syncNow`。
- Produces: `initSync(): () => void`——供 page.tsx 挂载。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/sync/__tests__/init.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners = new Set<() => void>();
let eventsSnapshot: Array<{ eventId: string; kind: string; payload: { id: string } }> = [];

vi.mock('@/lib/ledger/store', () => ({
  subscribe: vi.fn((fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }),
  getEventsSnapshot: vi.fn(() => eventsSnapshot),
}));
vi.mock('@/lib/sync/status', () => ({ markUnsynced: vi.fn() }));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn().mockResolvedValue(undefined) }));

import { markUnsynced } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  eventsSnapshot = [];
});

describe('initSync', () => {
  it('账本变化时，新出现的 transaction_created 事件被标记为未同步，并触发一次同步', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();

    eventsSnapshot = [
      { eventId: 'e1', kind: 'transaction_created', payload: { id: 'tx1' } },
    ];
    for (const fn of listeners) fn();
    await Promise.resolve();

    expect(markUnsynced).toHaveBeenCalledWith(['tx1']);
    expect(syncNow).toHaveBeenCalled();
  });

  it('同一个 eventId 只标记一次（不会因为多次订阅通知而重复 markUnsynced）', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();

    eventsSnapshot = [
      { eventId: 'e1', kind: 'transaction_created', payload: { id: 'tx1' } },
    ];
    for (const fn of listeners) fn();
    for (const fn of listeners) fn(); // 同一份快照再通知一次
    await Promise.resolve();

    expect(markUnsynced).toHaveBeenCalledTimes(1);
  });

  it('非 transaction 事件（如 raw_input_queued）不触发 markUnsynced', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();

    eventsSnapshot = [
      { eventId: 'e1', kind: 'raw_input_queued', payload: { id: 'q1' } },
    ];
    for (const fn of listeners) fn();
    await Promise.resolve();

    expect(markUnsynced).not.toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalled(); // 仍然触发同步——排队事件本身也要同步到 Drive
  });

  it('返回的取消函数会解除订阅', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    const cleanup = initSync();
    expect(listeners.size).toBe(1);
    cleanup();
    expect(listeners.size).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/sync/__tests__/init.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/sync/init.ts`：

```typescript
import { subscribe, getEventsSnapshot } from '@/lib/ledger/store';
import type { LedgerEvent } from '@/lib/ledger/events';
import { markUnsynced } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';

let seenEventIds = new Set<string>();

function newlyCreatedOrAmendedTxIds(events: LedgerEvent[]): string[] {
  const ids: string[] = [];
  for (const e of events) {
    if (seenEventIds.has(e.eventId)) continue;
    seenEventIds.add(e.eventId);
    if (e.kind === 'transaction_created' || e.kind === 'transaction_amended') {
      ids.push(e.payload.id);
    }
  }
  return ids;
}

/**
 * 应用启动时调用一次：账本每次变化（本地新增/修改/删除账目、排队/补跑
 * 离线输入）都触发一次同步；新出现的 transaction_created/amended 事件
 * 先标记为未同步，再异步同步（spec §7 同步时机："尽快推送，不做批量攒批"）。
 * 同步失败与否由 sync/status.ts 记录，这里不处理错误分支——UI 层的
 * 分级预警负责后续提示。
 */
export function initSync(): () => void {
  seenEventIds = new Set(getEventsSnapshot().map((e) => e.eventId));
  return subscribe(() => {
    const newIds = newlyCreatedOrAmendedTxIds(getEventsSnapshot());
    if (newIds.length > 0) markUnsynced(newIds);
    void syncNow().catch(() => {});
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/sync/__tests__/init.test.ts`
Expected: PASS

- [ ] **Step 5: 挂载到 page.tsx**

在 `src/app/page.tsx` 顶部 import 区加：

```typescript
import { initSync } from '@/lib/sync/init';
```

在既有的 `useEffect(() => { return initOfflineQueueAutoRetry(); }, []);` 旁边加一个（两者独立，不合并成一个 effect，方便各自的 cleanup 语义清晰）：

```typescript
  useEffect(() => {
    return initSync();
  }, []);
```

- [ ] **Step 6: 跑全量回归 + 类型检查**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 7: 提交**

```bash
git add src/lib/sync/init.ts src/lib/sync/__tests__/init.test.ts src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(sync): initSync——账本变化时自动标记未同步并触发同步

单向依赖 ledger/store 与 sync/{status,engine}，避免 ledger 与 sync
之间循环 import。挂载在 page.tsx 的 useEffect 里，应用启动即生效。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 同步状态点 UI + UndoToast 待同步文案

**Files:**
- Create: `src/components/SyncStatusDot.tsx`
- Modify: `src/components/UndoToast.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/SyncStatusDot.test.tsx`
- Test: `src/components/__tests__/UndoToast.test.tsx`（若已存在则在其中追加，否则创建）

**Interfaces:**
- Consumes: Task 9 的 `subscribe`/`getSnapshot` (`@/lib/sync/status`)。
- Produces: `SyncStatusDot` 组件（无 props，自己订阅同步状态）；`UndoToast` 新增可选 prop `unsyncedCount?: number`。

- [ ] **Step 1: 字典加 key**

`src/lib/i18n/dictionary.ts` 的 `DictKey` 联合类型加：

```typescript
  | 'syncPendingCount'
  | 'syncedUpToDate'
```

`en`：

```typescript
  syncPendingCount: ({ count }) => `${count} pending sync`,
  syncedUpToDate: 'Synced',
```

`zh`：

```typescript
  syncPendingCount: ({ count }) => `${count} 笔待同步`,
  syncedUpToDate: '已同步',
```

`undoneCount` 的两处实现（en/zh）分别改成把待同步数一起说出来（spec §8.5 第 2 点："已记录 3 笔 · 待同步 · 撤销"）：

en 原来：

```typescript
  undoneCount: ({ count }) => `Recorded ${count} item${count === 1 ? '' : 's'}`,
```

改成：

```typescript
  undoneCount: ({ count, unsynced }) =>
    `Recorded ${count} item${count === 1 ? '' : 's'}${Number(unsynced) > 0 ? ' · pending sync' : ''}`,
```

zh 原来：

```typescript
  undoneCount: ({ count }) => `已记录 ${count} 笔`,
```

改成：

```typescript
  undoneCount: ({ count, unsynced }) =>
    `已记录 ${count} 笔${Number(unsynced) > 0 ? ' · 待同步' : ''}`,
```

- [ ] **Step 2: 写失败的测试（SyncStatusDot）**

创建 `src/components/__tests__/SyncStatusDot.test.tsx`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { markUnsynced, markSynced, getSnapshot } from '@/lib/sync/status';

beforeEach(() => markSynced(getSnapshot().unsyncedIds));

describe('SyncStatusDot', () => {
  it('没有未同步项时显示已同步', () => {
    render(<SyncStatusDot />);
    expect(screen.getByText('Synced')).toBeDefined();
  });

  it('有未同步项时显示数量', () => {
    markUnsynced(['tx1', 'tx2']);
    render(<SyncStatusDot />);
    expect(screen.getByText('2 pending sync')).toBeDefined();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/SyncStatusDot.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 4: 实现 SyncStatusDot**

创建 `src/components/SyncStatusDot.tsx`：

```typescript
'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, type SyncState } from '@/lib/sync/status';
import { useLocale } from '@/lib/i18n/context';

const EMPTY: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/**
 * 主屏左上角全局唯一一处同步状态点（spec §13.1 第 3 条）：
 * 一个数字，零打扰，永久可见。分级预警（横幅/模态）在 Task 14 里
 * 是单独的组件，只在超过阈值时才叠加出现，不在这里画。
 */
export function SyncStatusDot() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { t } = useLocale();
  return (
    <span role="status">
      {state.unsyncedIds.length > 0
        ? t('syncPendingCount', { count: state.unsyncedIds.length })
        : t('syncedUpToDate')}
    </span>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/SyncStatusDot.test.tsx`
Expected: PASS

- [ ] **Step 6: UndoToast 接入待同步文案**

修改 `src/components/UndoToast.tsx`，给 `count` 旁边加一个 `unsyncedCount` prop，并在渲染时传给 `t('undoneCount', ...)`：

```typescript
export function UndoToast({
  count,
  unsyncedCount = 0,
  onUndo,
  onDismiss,
}: {
  count: number;
  unsyncedCount?: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div role="status">
      <span>{t('undoneCount', { count, unsynced: unsyncedCount })}</span>
      <button type="button" onClick={onUndo}>
        {t('undo')}
      </button>
    </div>
  );
}
```

若 `src/components/__tests__/UndoToast.test.tsx` 尚不存在，创建它（若已存在，在其中追加下面这条即可）：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { UndoToast } from '@/components/UndoToast';

describe('UndoToast', () => {
  it('unsyncedCount > 0 时文案带上待同步', () => {
    render(<UndoToast count={3} unsyncedCount={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Recorded 3 items · pending sync')).toBeDefined();
  });

  it('unsyncedCount 为 0（或不传）时不带待同步字样', () => {
    render(<UndoToast count={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Recorded 3 items')).toBeDefined();
  });
});
```

- [ ] **Step 7: page.tsx 接线**

在 `src/app/page.tsx` 顶部加：

```typescript
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
```

`<header>` 里 `<h1>` 后面加：

```typescript
        <SyncStatusDot />
```

`<UndoToast ... />` 的 props 里加 `unsyncedCount`：

```typescript
        <UndoToast
          key={lastAdded.join(',')}
          count={lastAdded.length}
          unsyncedCount={
            lastAdded.filter((id) => getSyncSnapshot().unsyncedIds.includes(id)).length
          }
          onUndo={undo}
          onDismiss={clearToast}
        />
```

- [ ] **Step 8: 跑全量回归**

Run: `npm test -- --run`
Expected: 全部通过（既有引用 `UndoToast`/page 的测试若断言了旧的 `已记录 N 笔`/`Recorded N items` 精确文案且没传 `unsyncedCount`，应仍然匹配——因为不传时 `unsynced` 是 `0`，拼接结果与原文案相同）

- [ ] **Step 9: 提交**

```bash
git add src/components/SyncStatusDot.tsx src/components/UndoToast.tsx src/components/__tests__/SyncStatusDot.test.tsx src/components/__tests__/UndoToast.test.tsx src/lib/i18n/dictionary.ts src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): 同步状态点 + UndoToast 带待同步文案（spec §8.5、§13.1）

主屏左上角全局唯一一处状态点，零打扰；提交后的 toast 在原有
"已记录 N 笔"后面按需追加"· 待同步"，不增加额外打扰。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: TransactionRow——已同步/未同步圆点

**Files:**
- Modify: `src/components/TransactionRow.tsx`
- Test: `src/components/__tests__/LedgerList.test.tsx`

**Interfaces:**
- Consumes: Task 9 的 `subscribe`/`getSnapshot` (`@/lib/sync/status`)。

- [ ] **Step 1: 写失败的测试**

在 `src/components/__tests__/LedgerList.test.tsx` 追加（复用文件已有的 `tx()` 工厂函数）：

```typescript
import { markUnsynced, markSynced, getSnapshot as getSyncSnapshot } from '@/lib/sync/status';

describe('同步状态圆点', () => {
  beforeEach(() => markSynced(getSyncSnapshot().unsyncedIds));

  it('未同步的账目显示空心圆点', () => {
    markUnsynced(['a']);
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.getByText('○')).toBeDefined();
  });

  it('已同步的账目显示实心圆点', () => {
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.getByText('●')).toBeDefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/LedgerList.test.tsx`
Expected: FAIL（当前 `TransactionRow` 不渲染圆点）。

- [ ] **Step 3: 实现**

修改 `src/components/TransactionRow.tsx`：

```typescript
import type { Transaction } from '@/lib/ai/schema';
import { useLocale } from '@/lib/i18n/context';
import { CATEGORY_LABELS } from '@/lib/i18n/dictionary';
import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot as getSyncSnapshot, type SyncState } from '@/lib/sync/status';

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
  return (
    <li>
      {/* 未同步/已同步的持久视觉标记（spec §8.5 第 1 点），零打扰、永久可见 */}
      <span aria-hidden="true">{synced ? '●' : '○'}</span>
      <span>{transaction.merchant ?? '—'}</span>
      <span>{transaction.description}</span>
      <span>{CATEGORY_LABELS[locale][transaction.category]}</span>
      <span>{`${sign}${formatAmount(transaction.amountCents, transaction.currency)}`}</span>
    </li>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/LedgerList.test.tsx`
Expected: PASS

- [ ] **Step 5: 跑全量回归 + 提交**

Run: `npm test -- --run`

```bash
git add src/components/TransactionRow.tsx src/components/__tests__/LedgerList.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TransactionRow 显示已同步/未同步圆点（spec §8.5）

●已同步 / ○未同步，零样式约束下用字符而非图标，跟同步状态
store 直接订阅，不经 props 传递。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: B 类分级预警（横幅/模态）+ 一键导出

**Files:**
- Create: `src/components/SyncWarning.tsx`
- Create: `src/lib/sync/export.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/components/__tests__/SyncWarning.test.tsx`
- Test: `src/lib/sync/__tests__/export.test.ts`

**Interfaces:**
- Consumes: Task 9 的 `subscribe`/`getSnapshot`/`classifyBTier` (`@/lib/sync/status`)；Task 10 的 `syncNow`；既有的 `readAllEvents` (`@/lib/ledger/db`)。
- Produces: `exportBackup(): Promise<void>`（触发浏览器下载 JSON 文件，spec §8.7）；`SyncWarning` 组件（24–72h 渲染持久横幅，>72h 渲染模态，两者互斥）。

- [ ] **Step 1: 字典加 key**

`DictKey` 联合类型加：

```typescript
  | 'syncWarningBanner'
  | 'syncWarningModalTitle'
  | 'syncRetry'
  | 'exportBackup'
```

`en`：

```typescript
  syncWarningBanner: "Not backed up to the cloud yet — check your connection.",
  syncWarningModalTitle: 'Some entries have been unsynced for a while.',
  syncRetry: 'Retry sync',
  exportBackup: 'Export backup',
```

`zh`：

```typescript
  syncWarningBanner: '尚未备份到云端，检查一下网络。',
  syncWarningModalTitle: '有些账目已经很久没同步了。',
  syncRetry: '重试同步',
  exportBackup: '导出备份',
```

- [ ] **Step 2: 写失败的测试（export.ts）**

创建 `src/lib/sync/__tests__/export.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/ledger/db', () => ({ readAllEvents: vi.fn() }));

import { exportBackup } from '@/lib/sync/export';
import { readAllEvents } from '@/lib/ledger/db';

afterEach(() => vi.restoreAllMocks());

describe('exportBackup', () => {
  it('把全部事件序列化成 JSON 并触发浏览器下载', async () => {
    vi.mocked(readAllEvents).mockResolvedValue([
      { eventId: 'e1', kind: 'transaction_created' } as never,
    ]);

    const clickSpy = vi.fn();
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: clickSpy, href: '', download: '' } as unknown as HTMLAnchorElement);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await exportBackup();

    expect(readAllEvents).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- --run src/lib/sync/__tests__/export.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 export.ts**

创建 `src/lib/sync/export.ts`：

```typescript
import { readAllEvents } from '@/lib/ledger/db';

/**
 * 一键导出（spec §8.7）：不依赖授权、网络或平台特性，是整套预警机制里
 * 最坏情况下唯一仍然有效的兜底。直接读本地 IndexedDB，触发文件下载。
 */
export async function exportBackup(): Promise<void> {
  const events = await readAllEvents();
  const json = JSON.stringify(events, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `justsayit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- --run src/lib/sync/__tests__/export.test.ts`
Expected: PASS

- [ ] **Step 6: 写失败的测试（SyncWarning）**

创建 `src/components/__tests__/SyncWarning.test.tsx`：

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SyncWarning } from '@/components/SyncWarning';
import { markUnsynced, markSynced, markAuthError, clearAuthError, getSnapshot } from '@/lib/sync/status';

vi.mock('@/lib/sync/export', () => ({ exportBackup: vi.fn() }));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn() }));

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
});
afterEach(() => vi.useRealTimers());

describe('SyncWarning', () => {
  it('没有未同步项、没有 authError 时不渲染任何内容', () => {
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('未同步不足 24 小时时不渲染横幅（spec §8.4：<24h 只用状态点，不打扰）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    markUnsynced(['tx1']);
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('24-72 小时之间渲染持久横幅', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z')); // +36h
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });

  it('超过 72 小时渲染模态，含重试同步与导出备份两个动作', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z')); // +72h
    render(<SyncWarning />);
    expect(screen.getByText(/unsynced for a while/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeDefined();
  });

  it('authError 时立刻渲染提示，不看时间阈值（A 类失败，spec §8.3）', () => {
    markAuthError();
    render(<SyncWarning />);
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
  });
});
```

- [ ] **Step 7: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/SyncWarning.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 8: 实现 SyncWarning**

创建 `src/components/SyncWarning.tsx`：

```typescript
'use client';

import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, classifyBTier, type SyncState } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';

const EMPTY: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
};

/**
 * B 类分级预警（spec §8.4）+ A 类失败提示（spec §8.3）。
 * A 类失败（authError）不看时间，直接给出跟 >72h 模态一样的两个动作——
 * "重试同步"这里语义上是"重新走一次 syncNow，如果是授权问题会再次
 * 引导登录"（真正的重新登录跳转留给 Plan 4 的设置页，这里先把动作
 * 暴露出来，不阻塞本 Plan）。
 */
export function SyncWarning() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { t } = useLocale();
  const tier = classifyBTier(state);

  if (state.authError || tier === 'gt72h') {
    return (
      <div role="alertdialog">
        <p>{t('syncWarningModalTitle')}</p>
        <button type="button" onClick={() => void syncNow()}>
          {t('syncRetry')}
        </button>
        <button type="button" onClick={() => void exportBackup()}>
          {t('exportBackup')}
        </button>
      </div>
    );
  }

  if (tier === '24to72h') {
    return (
      <div role="status">
        <p>{t('syncWarningBanner')}</p>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/SyncWarning.test.tsx`
Expected: PASS

- [ ] **Step 10: page.tsx 接线**

在 `src/app/page.tsx` 顶部加：

```typescript
import { SyncWarning } from '@/components/SyncWarning';
```

放在 `<LedgerList transactions={transactions} />` 之后（在列表和输入区之间——用户扫到列表异常后立刻能看见预警，同时不挡住底部固定的输入区）：

```typescript
      <SyncWarning />
```

- [ ] **Step 11: 跑全量回归 + 类型检查**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 12: 提交**

```bash
git add src/components/SyncWarning.tsx src/lib/sync/export.ts src/lib/sync/__tests__/export.test.ts src/components/__tests__/SyncWarning.test.tsx src/lib/i18n/dictionary.ts src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): B 类分级预警横幅/模态 + A 类失败提示 + 一键导出

24-72h 持久横幅，>72h 或 authError 弹模态给"重试同步"/"导出备份"
两个动作（spec §8.3-8.4、§8.7）。导出直接读本地 IndexedDB 触发
下载，不依赖授权/网络/平台。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: 平台分支文案 + iOS 安装引导时机升级

**Files:**
- Create: `src/lib/platform.ts`
- Modify: `src/components/SyncWarning.tsx`
- Modify: `src/lib/i18n/dictionary.ts`
- Test: `src/lib/__tests__/platform.test.ts`
- Test: `src/components/__tests__/SyncWarning.test.tsx`

**Interfaces:**
- Produces: `isIOS(ua?: string): boolean`、`isStandalone(): boolean`（是否已安装到主屏幕）——供 `SyncWarning` 组件与（Plan 4 的）安装引导横幅共用。

- [ ] **Step 1: 写失败的测试**

创建 `src/lib/__tests__/platform.test.ts`：

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isIOS, isStandalone } from '@/lib/platform';

afterEach(() => vi.unstubAllGlobals());

describe('isIOS', () => {
  it('iPhone UA 判定为 true', () => {
    expect(
      isIOS(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
      ),
    ).toBe(true);
  });

  it('iPad UA 判定为 true', () => {
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)')).toBe(true);
  });

  it('Android UA 判定为 false', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14)')).toBe(false);
  });

  it('桌面 UA 判定为 false', () => {
    expect(isIOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});

describe('isStandalone', () => {
  it('display-mode: standalone 匹配时返回 true', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(display-mode: standalone)',
    }));
    expect(isStandalone()).toBe(true);
  });

  it('未安装时返回 false', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(isStandalone()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- --run src/lib/__tests__/platform.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

创建 `src/lib/platform.ts`：

```typescript
/**
 * iOS 判定（含 iPad——iPadOS 13 起 UA 默认伪装成 Mac，但这里只处理
 * 经典 UA 字符串判定；iPadOS 的 Mac 伪装场景不影响本产品逻辑，
 * 因为那种情况下平台约束（ITP 等）与真正的 macOS Safari 一致）。
 */
export function isIOS(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone|iPad|iPod/.test(ua);
}

/** 是否已安装到主屏幕运行（spec §8.1：PWA 有独立存储容器与 ITP 豁免）。 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- --run src/lib/__tests__/platform.test.ts`
Expected: PASS

- [ ] **Step 5: 字典加平台分支文案**

`DictKey` 加：

```typescript
  | 'syncWarningBannerIOS'
```

`en`：

```typescript
  syncWarningBannerIOS: 'Not synced yet — Safari may clear this data after 7 days. Add to Home Screen to keep it safe.',
```

`zh`：

```typescript
  syncWarningBannerIOS: '尚未同步——Safari 可能在 7 天后清除这些数据，添加到主屏幕可以避免。',
```

- [ ] **Step 6: 写失败的测试（SyncWarning 平台分支）**

在 `src/components/__tests__/SyncWarning.test.tsx` 追加：

```typescript
import { isIOS, isStandalone } from '@/lib/platform';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));

describe('SyncWarning 平台分支文案（spec §8.6）', () => {
  it('iOS + 未安装时用"可能被清除"文案', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Safari may clear this data/)).toBeDefined();
  });

  it('iOS 但已安装时不用"可能被清除"文案（有 ITP 豁免，spec §8.2）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
    expect(screen.queryByText(/Safari may clear/)).toBeNull();
  });

  it('非 iOS 平台一律用"尚未备份到云端"文案', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });
});
```

- [ ] **Step 7: 运行测试确认失败**

Run: `npm test -- --run src/components/__tests__/SyncWarning.test.tsx`
Expected: FAIL（新用例失败，之前的用例应仍通过——如果之前的用例也失败了，检查是不是 `vi.mock('@/lib/platform', ...)` 影响了没有显式 mock 返回值的用例，需要在 `beforeEach` 里给 `isIOS`/`isStandalone` 设默认值 `false`）。

在 `SyncWarning.test.tsx` 顶部的 `beforeEach` 里补上默认值，避免前面几个用例因为新增的 mock 而拿到 `undefined`：

```typescript
beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
  vi.mocked(isIOS).mockReturnValue(false);
  vi.mocked(isStandalone).mockReturnValue(false);
});
```

- [ ] **Step 8: 实现——SyncWarning 加平台分支**

修改 `src/components/SyncWarning.tsx`，24–72h 横幅分支从：

```typescript
  if (tier === '24to72h') {
    return (
      <div role="status">
        <p>{t('syncWarningBanner')}</p>
      </div>
    );
  }
```

改成：

```typescript
  if (tier === '24to72h') {
    // "可能被清除"仅 iOS + 未安装为真（spec §8.6）；已安装的 iOS PWA
    // 有 ITP 豁免，其它平台用更平和的"尚未备份"，避免制造不必要的焦虑。
    const iosAtRisk = isIOS() && !isStandalone();
    return (
      <div role="status">
        <p>{t(iosAtRisk ? 'syncWarningBannerIOS' : 'syncWarningBanner')}</p>
      </div>
    );
  }
```

顶部 import 加：

```typescript
import { isIOS, isStandalone } from '@/lib/platform';
```

- [ ] **Step 9: 运行测试确认通过**

Run: `npm test -- --run src/components/__tests__/SyncWarning.test.tsx`
Expected: PASS

- [ ] **Step 10: 跑全量回归 + 类型检查**

Run: `npm test -- --run && npx tsc --noEmit`
Expected: 全部通过

- [ ] **Step 11: 提交**

```bash
git add src/lib/platform.ts src/lib/__tests__/platform.test.ts src/components/SyncWarning.tsx src/components/__tests__/SyncWarning.test.tsx src/lib/i18n/dictionary.ts
git commit -m "$(cat <<'EOF'
feat(ui): 同步预警按平台分支文案（spec §8.6）

"可能被 Safari 清除"只在 iOS + 未安装到主屏幕时为真；已安装的
iOS PWA 有 ITP 豁免，其它平台一律用"尚未备份到云端"，避免制造
不准确的焦虑。isIOS/isStandalone 是通用平台判定，为 Plan 4 的
PWA 安装引导横幅预留（复用同一对函数，不重复实现）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

> **留给后续（不在本 Plan 里做）：** spec §8.8 要求"检测到 iOS + 未安装 + 有未同步数据时，把安装引导提升为高优先级"——这依赖一个真正的安装引导 UI（"添加到主屏幕"的操作说明/横幅），而这个 UI 本身是 Plan 4 的 PWA 范围（spec §13.4 的 Service Worker、可安装性）。本 Plan 已经把判断这个场景所需的两个原语（`isIOS`/`isStandalone`，以及"是否有未同步数据"可由 `sync/status.ts` 的 `unsyncedIds.length > 0` 得到）准备好，Plan 4 实现安装引导横幅时，直接组合这三者判断是否要把引导提到高优先级即可，不需要再回头改 Plan 3 的代码。

---

## Self-Review 记录

**Spec 覆盖检查：**
- §5.1 剩余两种事件类型 → Task 1
- §7 同步机制（每设备独立文件、appDataFolder、去重合并、不做冲突合并）→ Task 8、Task 10
- §7 同步时机（尽快推送不攒批）→ Task 11
- §8.1-8.2 平台约束推出的结论（PWA 降级为体验优化、残留风险窗口）→ 体现在 Task 15 的文案分支与说明，未同步数据的安装引导升级本身留给 Plan 4（见 Task 15 末尾说明）
- §8.3 两类失败区分 → Task 9（`authError` 字段）、Task 10（`syncNow` 的错误分类）
- §8.4 B 类三级阈值 → Task 9（`classifyBTier`）、Task 14（UI 分支）
- §8.5 每次记账的状态告知（持久标记 + toast 内嵌状态）→ Task 12、Task 13
- §8.6 平台分支文案 → Task 15
- §8.7 一键导出 → Task 14
- §8.8 安装引导时机 → 原语就绪，UI 留给 Plan 4（已在 Task 15 末尾显式记录，不是遗漏）
- §9 离线队列（raw_input_queued/resolved、联网自动补跑）→ Task 1、2、3、4、5
- §11.3 令牌流（后端持有 refresh token，仅做兑换；账本不流经后端）→ Task 6、7；Task 8 的 Drive 调用全部在浏览器验证了这一点
- §11.4 降级策略（离线可查看历史、新输入排队）→ Task 5
- §13.1 同步状态点（全局唯一一处）→ Task 12
- §13.3 目录结构（`lib/sync/drive.ts`、`lib/sync/status.ts`）→ 全部任务遵循，另加 `lib/sync/engine.ts`、`lib/sync/init.ts`、`lib/sync/export.ts`（spec 目录示例未穷举到这个粒度，属于同一目录下的合理拆分，未违反"每个文件一个清晰职责"的原则）

**未覆盖、且确认属于本 Plan 范围之外的部分：** §12（部署）、§6.4/§6.5（统计与编辑）、§13.4（Service Worker）——均已由用户确认属于 Plan 4，不在本 Plan 重复规划。

**占位符扫描：** 全文没有 "TBD"/"实现细节自行补充"/"类似 Task N" 之类的占位表达；每个 Step 的代码块都是可以直接落盘的完整实现。

**类型一致性检查：** `structureTextToTransactions`（Task 3）在 Task 4、Task 5 里签名保持一致；`syncNow`（Task 10）在 Task 11、Task 14 里调用方式一致（无参数、返回 `Promise<void>`）；`SyncState` 的字段名（`unsyncedIds`/`firstUnsyncedAt`/`authError`/`lastSyncedAt`）在 Task 9/10/11/12/13/14/15 里保持一致，未出现 `unsynced_ids` 或 `pendingIds` 这类漂移写法。
