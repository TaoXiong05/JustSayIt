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
 * 进入无限重渲染(spec §6.6)。派生一律在组件里用 useMemo。
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
