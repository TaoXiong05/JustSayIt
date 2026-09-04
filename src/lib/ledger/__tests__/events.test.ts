import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHEMA_VERSION,
  getDeviceId,
  createTransactionCreated,
  createTransactionAmended,
  createTransactionDeleted,
  createRawInputQueued,
  createRawInputResolved,
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

  it('amended 事件带齐公共字段且 payload 为 { id, changes }', () => {
    const changes = { description: 'x' };
    const e = createTransactionAmended('tx1', changes);
    expect(e.kind).toBe('transaction_amended');
    expect(e.schemaVersion).toBe(SCHEMA_VERSION);
    expect(e.eventId).toMatch(/[0-9a-f-]{36}/);
    expect(e.deviceId).toBe(getDeviceId());
    expect(new Date(e.createdAt).toString()).not.toBe('Invalid Date');
    if (e.kind !== 'transaction_amended') throw new Error('unreachable');
    expect(e.payload.id).toBe('tx1');
    expect(e.payload.changes).toEqual(changes);
  });

  it('构造后修改调用方对象不影响已构造的事件（不可变性保证）', () => {
    const localTx: Transaction = { ...tx };
    const created = createTransactionCreated(localTx);
    localTx.description = 'mutated-after-construction';
    if (created.kind !== 'transaction_created') throw new Error('unreachable');
    expect(created.payload.description).not.toBe('mutated-after-construction');

    const changes = { description: '原始' };
    const amended = createTransactionAmended('tx1', changes);
    changes.description = 'mutated-after-construction';
    if (amended.kind !== 'transaction_amended') throw new Error('unreachable');
    expect(amended.payload.changes.description).not.toBe(
      'mutated-after-construction',
    );
  });
});

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
