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
