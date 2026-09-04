import { describe, it, expect, vi, beforeEach } from 'vitest';

const listeners = new Set<() => void>();
let eventsSnapshot: Array<{
  eventId: string;
  deviceId: string;
  kind: string;
  payload: { id: string };
}> = [];

vi.mock('@/lib/ledger/store', () => ({
  subscribe: vi.fn((fn: () => void) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }),
  getEventsSnapshot: vi.fn(() => eventsSnapshot),
}));
vi.mock('@/lib/ledger/events', () => ({ getDeviceId: vi.fn(() => 'this-device') }));
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
      { eventId: 'e1', deviceId: 'this-device', kind: 'transaction_created', payload: { id: 'tx1' } },
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
      { eventId: 'e1', deviceId: 'this-device', kind: 'transaction_created', payload: { id: 'tx1' } },
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
      { eventId: 'e1', deviceId: 'this-device', kind: 'raw_input_queued', payload: { id: 'q1' } },
    ];
    for (const fn of listeners) fn();
    await Promise.resolve();

    expect(markUnsynced).not.toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalled(); // 仍然触发同步——排队事件本身也要同步到 Drive
  });

  it('别的设备产生的事件不会被标记未同步（回归：新设备首次合并进历史账目时，圆点永远显示未同步）', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();

    // 模拟：本设备首次同步，从 Drive 下载合并了另一台设备已经同步过的账目
    eventsSnapshot = [
      {
        eventId: 'e-from-other-device',
        deviceId: 'other-device',
        kind: 'transaction_created',
        payload: { id: 'tx-from-other-device' },
      },
    ];
    for (const fn of listeners) fn();
    await Promise.resolve();

    expect(markUnsynced).not.toHaveBeenCalled();
    expect(syncNow).toHaveBeenCalled(); // 仍然要同步一次（比如本设备自己也有事情要传）
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