import { describe, it, expect } from 'vitest';
import { replay } from '@/lib/ledger/replay';
import {
  createTransactionCreated,
  createRawInputQueued,
  createRawInputResolved,
  type LedgerEvent,
} from '@/lib/ledger/events';
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

  it('并发 amend 同一字段时按 createdAt 生效，不依赖事件数组本身的顺序（回归：多设备合并后，数组顺序是"本地写入顺序"而非"实际编辑时间"，曾经谁排在数组后面谁就生效，导致两台设备各自合并出不同结果，永久不一致）', () => {
    const created = evt('transaction_created', tx('a'));
    const earlyAmend = {
      ...evt('transaction_amended', { id: 'a', changes: { amountCents: 3000 } }),
      createdAt: '2026-09-04T10:00:00+10:00',
    };
    const laterAmend = {
      ...evt('transaction_amended', { id: 'a', changes: { amountCents: 4000 } }),
      createdAt: '2026-09-04T10:05:00+10:00',
    };

    // 数组顺序刻意反过来，模拟"更晚发生的编辑反而先被本地存下"（同步合并
    // 的典型情形）——不管数组顺序如何，createdAt 更晚的那次编辑都该生效。
    const l1 = replay([created, laterAmend, earlyAmend]);
    const l2 = replay([created, earlyAmend, laterAmend]);
    expect(l1.transactions[0].amountCents).toBe(4000);
    expect(l2.transactions[0].amountCents).toBe(4000);
  });

  it('createdAt 完全相同时（同一毫秒的真并发）按 eventId 排序兜底，保证两种数组顺序算出同一个结果', () => {
    const created = evt('transaction_created', tx('a'));
    const amendX = {
      ...evt('transaction_amended', { id: 'a', changes: { amountCents: 3000 } }),
      eventId: 'x',
    };
    const amendY = {
      ...evt('transaction_amended', { id: 'a', changes: { amountCents: 4000 } }),
      eventId: 'y',
    };
    const l1 = replay([created, amendY, amendX]);
    const l2 = replay([created, amendX, amendY]);
    expect(l1.transactions[0].amountCents).toBe(l2.transactions[0].amountCents);
  });

  it('raw_input_queued / raw_input_resolved 不影响 transactions（不是 Transaction 事件）', () => {
    const created = createTransactionCreated(tx('a'));
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
});
