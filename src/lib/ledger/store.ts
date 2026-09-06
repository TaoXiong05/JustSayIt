import { appendEvents, readAllEvents } from '@/lib/ledger/db';
import { replay, type Ledger } from '@/lib/ledger/replay';
import {
  createTransactionCreated,
  createTransactionAmended,
  createTransactionDeleted,
  createRawInputQueued,
  createRawInputResolved,
  type LedgerEvent,
  type RawInputQueuedPayload,
} from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';
import { createEmitter } from '@/lib/emitter';

const EMPTY: Ledger = { transactions: [] };

let events: LedgerEvent[] = [];
let ledger: Ledger = EMPTY;
const { subscribe, emit } = createEmitter();
export { subscribe };

/**
 * 跨标签页/跨窗口同步（用户反馈：浏览器标签页和已安装的 PWA 窗口是两个
 * 独立进程，各自只在内存里持有自己的账本状态，共享的只有 IndexedDB——
 * 一边删了账目，另一边不重新读一次 IndexedDB 就永远不知道，得手动刷新）。
 * 用 BroadcastChannel 广播"账本变了"，不广播具体内容——收到通知的一方
 * 自己重新 hydrate() 去读真相来源（IndexedDB），避免两边对"发生了什么"
 * 理解不一致。只在 push() 里广播，hydrate() 本身不广播，否则收到广播的
 * 一方重新 hydrate 会再广播一次，形成乒乓循环。
 */
const CROSS_TAB_CHANNEL_NAME = 'justsayit-ledger-sync';
const crossTabChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CROSS_TAB_CHANNEL_NAME) : null;
if (crossTabChannel) {
  crossTabChannel.onmessage = () => void hydrate();
}

/**
 * 必须始终返回同一引用直到状态真正改变。
 * 切勿在此做筛选或映射——每次返回新数组会让 React 判定状态持续变化，
 * 进入无限重渲染(spec §6.6)。派生一律在组件里用 useMemo。
 */
export function getSnapshot(): Ledger {
  return ledger;
}

function commit(): void {
  ledger = replay(events);
  emit();
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
  // 广播推迟到下一个 microtask，不跟 commit()/emit() 挤在同一个执行栈——
  // 这条广播是给其它标签页/窗口看的，不该影响本地这次提交自己的 React
  // 批量更新/渲染时序（回归：曾经同步 postMessage 导致本地乐观 UI 的
  // 过渡态偶发被 waitFor 捕捉到，一份不该跟这次提交产生任何关联的
  // 副作用，不能挤在同一个调度窗口里）。
  if (crossTabChannel) queueMicrotask(() => crossTabChannel.postMessage('changed'));
}

export async function addTransactions(txs: Transaction[]): Promise<void> {
  await push(txs.map(createTransactionCreated));
}

export async function removeTransaction(id: string): Promise<void> {
  await push([createTransactionDeleted(id)]);
}

export async function amendTransaction(
  id: string,
  changes: Partial<Omit<Transaction, 'id'>>,
): Promise<void> {
  await push([createTransactionAmended(id, changes)]);
}

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
 * 供需要访问"账本以外"信息（如待处理队列、Drive 同步要上传哪些事件）的
 * 上层代码使用——ledger/store.ts 本身对这些用途一无所知，只负责给出事实。
 */
export function getEventsSnapshot(): LedgerEvent[] {
  return events;
}

/**
 * 该用户历史出现过的商户名，供归一化与（Plan 2）STT 偏置词表使用。
 * 从原始事件日志推导，而非当前账本的派生状态——账目被删除后，其商户名
 * 的写法仍应留在归一化词表里，否则同一商户可能在下次记账时重新分裂成
 * 另一种写法，恰好违背这个函数存在的目的。
 */
export function knownMerchants(): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.kind === 'transaction_created' && e.payload.merchant) {
      set.add(e.payload.merchant);
    } else if (e.kind === 'transaction_amended' && e.payload.changes.merchant) {
      set.add(e.payload.changes.merchant);
    }
  }
  return [...set];
}
