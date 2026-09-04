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
