import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribe,
  getSnapshot,
  markUnsynced,
  markSynced,
  markAuthError,
  clearAuthError,
  classifyBTier,
} from '@/lib/sync/status';

beforeEach(() => {
  // 每个用例前重置到干净状态——直接把已知的未同步 id 全部标记为已同步
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
});

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

describe('classifyBTier', () => {
  const base = { unsyncedIds: ['tx1'], authError: false, lastSyncedAt: null };

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