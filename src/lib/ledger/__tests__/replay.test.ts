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

  it('删除后同 id 重建不会产生重复条目', () => {
    const l = replay([
      evt('transaction_created', tx('a', { date: '2026-09-01', description: '第一次创建' })),
      evt('transaction_deleted', { id: 'a' }),
      evt('transaction_created', tx('a', { date: '2026-09-03', description: '第二次创建' })),
    ]);
    expect(l.transactions).toHaveLength(1);
    expect(l.transactions[0].date).toBe('2026-09-03');
    expect(l.transactions[0].description).toBe('第二次创建');
  });
});
