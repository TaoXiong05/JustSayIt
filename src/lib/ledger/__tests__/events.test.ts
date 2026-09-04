import { describe, it, expect, beforeEach } from 'vitest';
import {
  SCHEMA_VERSION,
  getDeviceId,
  createTransactionCreated,
  createTransactionAmended,
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
