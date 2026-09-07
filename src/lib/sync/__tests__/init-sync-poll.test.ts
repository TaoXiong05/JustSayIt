import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * 同步哨兵轮询（sentinel polling）的测试。
 *
 * 单独一个文件：initSync 会在 jsdom 全局的 window/document 上注册
 * focus/visibilitychange 监听，同一文件内多个 initSync 实例会互相残留——
 * 独立文件意味着独立的 jsdom 上下文，加上模块级 cleanup + afterEach，
 * 保证每个测试结束后监听被移除、不留残余。触发确定性 poll 一律用
 * `window.dispatchEvent(new Event('focus'))`，**不依赖 vitest fake-timer 的
 * advance 行为**（在模块级 mock + 共享监听下不可靠）。
 */

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
  // hydrate() 是异步读，mock 成立即 resolve——但仍是真 Promise，测试里
  // initSync() 后需 flush 完 hydrate().then 的回调（多层微任务）才落定。
  hydrate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ledger/events', () => ({ getDeviceId: vi.fn(() => 'this-device') }));
let unsyncedIds: string[] = [];
let lastError: string | null = null;
let authError = false;
vi.mock('@/lib/sync/status', () => ({
  markUnsynced: vi.fn(),
  reconcileUnsynced: vi.fn(),
  getSnapshot: vi.fn(() => ({ unsyncedIds, lastError, authError })),
}));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/sync/version', () => ({
  fetchSyncVersion: vi.fn().mockResolvedValue(0),
  bumpSyncVersion: vi.fn(),
}));

import { markUnsynced } from '@/lib/sync/status';
import { syncNow } from '@/lib/sync/engine';
import { hydrate } from '@/lib/ledger/store';
import { fetchSyncVersion } from '@/lib/sync/version';

let cleanupFn: (() => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  listeners.clear();
  eventsSnapshot = [];
  unsyncedIds = [];
  lastError = null;
  authError = false;
});

afterEach(() => {
  cleanupFn?.();
  cleanupFn = null;
  vi.useRealTimers();
});

async function flushHydrate(): Promise<void> {
  await Promise.resolve();
}

/**
 * 触发一次确定性的哨兵轮询：dispatch focus → onFocus 检查
 * document.visibilityState==='visible'（jsdom 默认即 visible）→ pollVersionOnce。
 * 返回前把 pollVersionOnce 里的 await fetchSyncVersion 微任务 flush 完。
 */
async function triggerPoll(): Promise<void> {
  window.dispatchEvent(new Event('focus'));
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('同步哨兵轮询（sentinel polling）', () => {
  it('基线建立后，其它设备 bump（版本变大）→ 触发一次同步去 Drive 拉取', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    // 用闭包控制哨兵值：跨 re-import 仍共享同一变量，规避实例归属不确定
    let version = 0;
    vi.mocked(fetchSyncVersion).mockImplementation(() => Promise.resolve(version));
    cleanupFn = initSync();
    await flushHydrate();
    // 第一次触发建立基线（version=0 → 不触发同步）
    await triggerPoll();
    vi.mocked(syncNow).mockClear();
    version = 1; // 模拟手机端写入后 server bump 了哨兵
    await triggerPoll();
    expect(syncNow).toHaveBeenCalledOnce();
  });

  it('哨兵没变 → 轮询不触发同步（安静时零 Drive 请求）', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    let version = 0;
    vi.mocked(fetchSyncVersion).mockImplementation(() => Promise.resolve(version));
    cleanupFn = initSync();
    await flushHydrate();
    await triggerPoll(); // 建立基线（0）
    vi.mocked(syncNow).mockClear();
    await triggerPoll(); // 仍是 0，0 不大于基线
    expect(syncNow).not.toHaveBeenCalled();
  });

  it('窗口重新聚焦 → 立即补查一次并发现变化去同步，不必等下一个 10s 周期', async () => {
    vi.resetModules();
    const { initSync } = await import('@/lib/sync/init');
    let version = 0;
    vi.mocked(fetchSyncVersion).mockImplementation(() => Promise.resolve(version));
    cleanupFn = initSync();
    await flushHydrate();
    // 触发第一次聚焦：本测试的 initSync 会注册 onFocus 监听
    await triggerPoll(); // 建立基线（0）
    vi.mocked(syncNow).mockClear();
    version = 5;
    await triggerPoll(); // 再次聚焦 → 补查 → 5 > 0 → sync
    expect(syncNow).toHaveBeenCalledOnce();
  });
});