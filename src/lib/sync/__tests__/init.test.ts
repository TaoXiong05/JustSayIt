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
  // 真实实现里 hydrate() 是从 IndexedDB 异步读——这里 mock 成"立刻 resolve"，
  // 但仍然是一次真正的 Promise，测试里 initSync() 之后要等一次微任务它才
  // 落地（回归：曾经在 hydrate() 真正落地前就同步取基线快照，见 init.ts
  // 的详细注释）。
  hydrate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ledger/events', () => ({ getDeviceId: vi.fn(() => 'this-device') }));
let unsyncedIds: string[] = [];
vi.mock('@/lib/sync/status', () => ({
  markUnsynced: vi.fn(),
  getSnapshot: vi.fn(() => ({ unsyncedIds })),
}));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn().mockResolvedValue(undefined) }));

import { markUnsynced } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { hydrate } from '@/lib/ledger/store';

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  eventsSnapshot = [];
  unsyncedIds = [];
});

/** initSync() 内部先 await 一次 hydrate() 才建立基线——等这次微任务落地。 */
async function flushHydrate() {
  await Promise.resolve();
}

describe('initSync', () => {
  it('全新设备首次登录：本地没有任何变化（没人新建/修改账目）也要主动同步一次，才能拉到其它设备已有的账目（回归：之前 syncNow 只在订阅回调里被动触发，全新设备在第一次本地改动之前永远不会主动去 Drive 拉取，登录后"看不到任何记录"）', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();
    await flushHydrate();

    // 关键：这里不模拟任何 store 变化通知（不调用 listeners 里的任何 fn）——
    // 全新设备的本地事件流从始至终是空的，不会有任何 push()/commit()。
    expect(syncNow).toHaveBeenCalled();
  });

  it('账本变化时，新出现的 transaction_created 事件被标记为未同步，并触发一次同步', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    initSync();
    // initSync() 自己调用 hydrate() 来确保基线正确，不依赖调用方（如
    // useLedger()）碰巧先把水合做完——两者各自独立，谁先谁后不能假设。
    expect(hydrate).toHaveBeenCalled();
    await flushHydrate();

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
    await flushHydrate();

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
    await flushHydrate();

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
    await flushHydrate();

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
    await flushHydrate();
    expect(listeners.size).toBe(1);
    cleanup();
    expect(listeners.size).toBe(0);
  });

  it('调用 cleanup 早于 hydrate() 落地时，落地后不会再订阅（回归防御：卸载竞态不留悬挂订阅）', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    const cleanup = initSync();
    cleanup(); // 组件在 hydrate() 落地之前就已经卸载
    await flushHydrate();
    expect(listeners.size).toBe(0);
  });

  it('回归：initSync() 自己确保水合完成后才建立基线，不会把 hydrate() 落地时已经存在的历史事件误判成"新事件"标记未同步 —— 曾经的写法在这里会把早就同步过的账目重新标成待同步（登出后失去有效登录态时，这个误判无法被后续的 syncNow() 自动纠正回去，会一直卡在界面上）', async () => {
    vi.resetModules();
    // 模拟：hydrate() 真正落地前，本地 IndexedDB 里其实已经有一批历史事件
    // （本设备自己产生的、早就同步过的账目）——但 initSync() 调用的那一刻，
    // 同步读到的 getEventsSnapshot() 还是空的（IndexedDB 读取本身是异步的）。
    const { initSync } = await import('@/lib/sync/init');
    initSync();
    // hydrate() 落地前，"历史事件"这时才真正写入 events 数组（模拟异步落地）
    eventsSnapshot = [
      {
        eventId: 'old-e1',
        deviceId: 'this-device',
        kind: 'transaction_created',
        payload: { id: 'old-tx-already-synced' },
      },
    ];
    await flushHydrate(); // hydrate() 落地——此时基线应该纳入这条历史事件

    // hydrate() 落地本身会触发一次 commit()/emit()，模拟这次通知
    for (const fn of listeners) fn();
    await Promise.resolve();

    // 历史事件不该被当成"新事件"标记未同步——它在基线建立之前就已经存在
    expect(markUnsynced).not.toHaveBeenCalled();
  });

  it('回归：兜底定时重试——账本变化触发的那次同步没追上（比如一次性网络抖动）之后，即使再也没有别的账本变化，只要还有未同步项，也会定期自动补跑，不需要用户刷新页面（用户反馈原话："提交记录，不刷新页面就一直显示等待同步"）', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const { initSync } = await import('@/lib/sync/init');
      initSync();
      await flushHydrate();
      vi.mocked(syncNow).mockClear(); // 只关心 hydrate 落地之后、兜底定时器触发的那次调用

      // 模拟：这笔账目一直没能同步掉（不管什么原因），且此后没有任何
      // 别的账本变化——没有 markUnsynced/syncNow 的新触发点
      unsyncedIds = ['tx-stuck'];

      await vi.advanceTimersByTimeAsync(15_000);
      expect(syncNow).toHaveBeenCalledTimes(1);

      // 假设这次补跑成功了，追上后不该继续没意义地反复调用
      unsyncedIds = [];
      vi.mocked(syncNow).mockClear();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(syncNow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleanup 会清掉兜底定时器，卸载后不再继续调用 syncNow', async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const { initSync } = await import('@/lib/sync/init');
      const cleanup = initSync();
      await flushHydrate();
      cleanup();
      vi.mocked(syncNow).mockClear();

      unsyncedIds = ['tx-stuck'];
      await vi.advanceTimersByTimeAsync(30_000);
      expect(syncNow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
