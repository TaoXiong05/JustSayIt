import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  subscribe,
  getSnapshot,
  markUnsynced,
  markSynced,
  markAuthError,
  clearAuthError,
  markSyncFailed,
  clearSyncError,
  reconcileUnsynced,
  classifyBTier,
} from '@/lib/sync/status';

beforeEach(() => {
  localStorage.clear();
  // 每个用例前重置到干净状态——直接把已知的未同步 id 全部标记为已同步
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
  clearSyncError();
});
afterEach(() => vi.useRealTimers());

describe('markUnsynced / markSynced', () => {
  // 本用例必须第一个跑：它断言 lastSyncedAt 初始为 null，而后续用例的
  // markSynced 会把它置为非 null（模块级单例状态跨测试残留，beforeEach
  // 的清理无法把 lastSyncedAt 重置回 null）——调整顺序而非放宽断言，保留全部验证强度。
  it('markSynced 更新 lastSyncedAt', () => {
    expect(getSnapshot().lastSyncedAt).toBeNull();
    markUnsynced(['tx1']);
    markSynced(['tx1']);
    expect(getSnapshot().lastSyncedAt).not.toBeNull();
  });

  it('markUnsynced 加入未同步集合并通知订阅者', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    markUnsynced(['tx1', 'tx2']);
    expect(getSnapshot().unsyncedIds).toEqual(expect.arrayContaining(['tx1', 'tx2']));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('markUnsynced 首次调用时记录 firstUnsyncedAt', () => {
    expect(getSnapshot().firstUnsyncedAt).toBeNull();
    markUnsynced(['tx1']);
    expect(getSnapshot().firstUnsyncedAt).not.toBeNull();
  });

  it('markSynced 清空对应 id，全部清空后 firstUnsyncedAt 重置为 null', () => {
    markUnsynced(['tx1', 'tx2']);
    markSynced(['tx1']);
    expect(getSnapshot().unsyncedIds).toEqual(['tx2']);
    expect(getSnapshot().firstUnsyncedAt).not.toBeNull();
    markSynced(['tx2']);
    expect(getSnapshot().unsyncedIds).toEqual([]);
    expect(getSnapshot().firstUnsyncedAt).toBeNull();
  });

  it('markSynced 成功会清掉 authError（一次成功同步说明授权恢复正常）', () => {
    markAuthError();
    markUnsynced(['tx1']);
    markSynced(['tx1']);
    expect(getSnapshot().authError).toBe(false);
  });
});

describe('markAuthError / clearAuthError', () => {
  it('markAuthError 置位，clearAuthError 复位', () => {
    markAuthError();
    expect(getSnapshot().authError).toBe(true);
    clearAuthError();
    expect(getSnapshot().authError).toBe(false);
  });
});

describe('markSyncFailed / clearSyncError', () => {
  it('记录失败原因并通知订阅者', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    markSyncFailed('Drive 更新文件失败：HTTP 401');
    expect(getSnapshot().lastError).toBe('Drive 更新文件失败：HTTP 401');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('clearSyncError 清掉上一次的失败原因', () => {
    markSyncFailed('boom');
    clearSyncError();
    expect(getSnapshot().lastError).toBeNull();
  });

  it('本来就没有失败记录时 clearSyncError 不做无意义的通知', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    clearSyncError();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('跨刷新持久化', () => {
  /** 模拟一次页面刷新：丢掉模块实例，重新 import 一份从存储里恢复的 */
  async function reload() {
    vi.resetModules();
    return import('@/lib/sync/status');
  }

  it('未同步集合与计时起点跨刷新存活（回归：状态只在内存里，刷新一律归零——不管有没有真的传上去都显示"已同步"，把同步失败藏了起来；24h/72h 的升级预警也因为计时每次刷新重置而永远不会触发）', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1', 'tx2']);

    const reloaded = await reload();
    expect(reloaded.getSnapshot().unsyncedIds).toEqual(['tx1', 'tx2']);
    expect(reloaded.getSnapshot().firstUnsyncedAt).toBe('2026-09-01T00:00:00.000Z');
  });

  it('同步成功后的清空同样跨刷新存活', async () => {
    markUnsynced(['tx1']);
    markSynced(['tx1']);

    const reloaded = await reload();
    expect(reloaded.getSnapshot().unsyncedIds).toEqual([]);
    expect(reloaded.getSnapshot().firstUnsyncedAt).toBeNull();
  });

  it('authError / lastError 不持久化——它们描述的是"最近一次尝试"的即时状况，刷新后马上会有一次新的同步重新给出结论，留着旧值只会显示已经不成立的报错', async () => {
    markUnsynced(['tx1']);
    markAuthError();
    markSyncFailed('Drive 列表请求失败：HTTP 403');

    const reloaded = await reload();
    expect(reloaded.getSnapshot().unsyncedIds).toEqual(['tx1']); // 这个要留下
    expect(reloaded.getSnapshot().authError).toBe(false);
    expect(reloaded.getSnapshot().lastError).toBeNull();
  });

  it('存储里是坏数据时回退到空状态，不把整个模块带崩', async () => {
    localStorage.setItem('justsayit.sync', '{ 不是合法 JSON');
    const reloaded = await reload();
    expect(reloaded.getSnapshot().unsyncedIds).toEqual([]);
  });

  it('存储里的形状不对（比如 unsyncedIds 不是数组）时同样回退到空状态', async () => {
    localStorage.setItem('justsayit.sync', JSON.stringify({ unsyncedIds: 'tx1' }));
    const reloaded = await reload();
    expect(reloaded.getSnapshot().unsyncedIds).toEqual([]);
  });
});

describe('reconcileUnsynced', () => {
  it('丢掉账本里已经不存在的 id——这类 id 永远等不到 markSynced（同步靠事件日志算"已上传哪些"），留着会让徽标永久停在待同步、兜底重试无休止地跑', () => {
    markUnsynced(['tx-alive', 'tx-gone']);
    reconcileUnsynced(['tx-alive']);
    expect(getSnapshot().unsyncedIds).toEqual(['tx-alive']);
  });

  it('全部丢掉后计时起点一并重置', () => {
    markUnsynced(['tx-gone']);
    reconcileUnsynced([]);
    expect(getSnapshot().unsyncedIds).toEqual([]);
    expect(getSnapshot().firstUnsyncedAt).toBeNull();
  });

  it('没有需要丢弃的 id 时不做无意义的通知', () => {
    markUnsynced(['tx1']);
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    reconcileUnsynced(['tx1']);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('classifyBTier', () => {
  const base = { unsyncedIds: ['tx1'], authError: false, lastSyncedAt: null, lastError: null };

  it('没有未同步项时是 ok', () => {
    expect(classifyBTier({ ...base, unsyncedIds: [], firstUnsyncedAt: null })).toBe('ok');
  });

  it('未满 24 小时是 lt24h', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    const firstUnsyncedAt = new Date('2026-09-05T00:00:01Z').toISOString();
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('lt24h');
  });

  it('恰好 24 小时进入 24to72h（边界含 24h）', () => {
    const firstUnsyncedAt = new Date('2026-09-04T00:00:00Z').toISOString();
    const now = new Date('2026-09-05T00:00:00Z'); // 恰好 24h
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('24to72h');
  });

  it('恰好 72 小时及以上进入 gt72h', () => {
    const firstUnsyncedAt = new Date('2026-09-01T00:00:00Z').toISOString();
    const now = new Date('2026-09-04T00:00:00Z'); // 恰好 72h
    expect(classifyBTier({ ...base, firstUnsyncedAt }, now)).toBe('gt72h');
  });
});