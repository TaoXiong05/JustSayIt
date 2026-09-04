import { describe, it, expect, beforeEach } from 'vitest';
import { appendEvents, readAllEvents, clearAllEvents } from '@/lib/ledger/db';
import type { LedgerEvent } from '@/lib/ledger/events';

const evt = (id: string): LedgerEvent => ({
  eventId: id,
  deviceId: 'dev',
  createdAt: '2026-09-04T10:00:00+10:00',
  schemaVersion: 1,
  kind: 'transaction_created',
  payload: {
    id: `tx-${id}`,
    type: 'EXPENSE',
    amountCents: 2500,
    currency: 'AUD',
    date: '2026-09-04',
    category: 'FOOD',
    merchant: null,
    description: '早餐',
  },
});

beforeEach(async () => {
  await clearAllEvents();
});

describe('事件存储', () => {
  it('空库读出空数组', async () => {
    expect(await readAllEvents()).toEqual([]);
  });

  it('追加后能读回', async () => {
    await appendEvents([evt('a')]);
    const all = await readAllEvents();
    expect(all).toHaveLength(1);
    expect(all[0].eventId).toBe('a');
  });

  it('保持写入顺序', async () => {
    await appendEvents([evt('a'), evt('b')]);
    await appendEvents([evt('c')]);
    expect((await readAllEvents()).map((e) => e.eventId)).toEqual(['a', 'b', 'c']);
  });

  it('同一 eventId 重复写入不产生重复记录（同步去重的基础）', async () => {
    await appendEvents([evt('a')]);
    await appendEvents([evt('a')]);
    expect(await readAllEvents()).toHaveLength(1);
  });

  it('空数组不报错', async () => {
    await expect(appendEvents([])).resolves.toBeUndefined();
  });
});
