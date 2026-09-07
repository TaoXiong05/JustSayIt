import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import {
  markUnsynced,
  markSynced,
  markSyncFailed,
  clearSyncError,
  markSyncing,
  markSyncSucceeded,
  getSnapshot,
} from '@/lib/sync/status';

// SyncStatusDot 失败详情里的"重试同步"直接调用 engine 的 syncNow——组件自身
// 测试里不跑真实同步，mock 掉。
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn() }));

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearSyncError();
  markSyncing(false);
});
afterEach(() => vi.useRealTimers());

describe('SyncStatusDot', () => {
  it('没有未同步项、未在同步、无失败时显示已同步（中性态）', () => {
    render(<SyncStatusDot />);
    const badge = screen.getByRole('status');
    expect(badge.dataset.state).toBe('synced');
    expect(badge.className).toContain('bg-surface-2');
    expect(screen.getByText('Synced')).toBeDefined();
  });

  it('有待同步项时显示数量：桌面完整文案"N pending sync"，移动端纯数字', () => {
    markUnsynced(['tx1', 'tx2']);
    render(<SyncStatusDot />);
    const badge = screen.getByRole('status');
    expect(badge.dataset.state).toBe('pending');
    // 桌面长文案（hidden md:inline，DOM 里仍在）
    expect(screen.getByText('2 pending sync')).toBeDefined();
    // 移动端纯数字（md:hidden）
    expect(screen.getByText('2')).toBeDefined();
  });

  it('正在同步时变成 Syncing + 转圈态', () => {
    markSyncing(true);
    render(<SyncStatusDot />);
    const badge = screen.getByRole('status');
    expect(badge.dataset.state).toBe('syncing');
    expect(badge.className).toContain('bg-brand-soft');
    expect(screen.getByText('Syncing…')).toBeDefined();
  });

  it('同步失败：整枚徽标变红且可点击，点击弹出失败详情卡片，可关闭', async () => {
    markUnsynced(['tx1']);
    markSyncFailed('Drive 更新文件失败：HTTP 401');
    const user = userEvent.setup();
    render(<SyncStatusDot />);

    const failBadge = screen.getByRole('button');
    expect(failBadge.dataset.state).toBe('failed');
    expect(failBadge.className).toContain('bg-danger-soft');
    // 失败原因挂在 title 上（原来的行为保留）
    expect(failBadge.title).toBe('Last sync failed: Drive 更新文件失败：HTTP 401');
    expect(screen.queryByRole('dialog')).toBeNull();

    // 点击徽标 → 弹出失败详情
    await user.click(failBadge);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(screen.getByText('Drive 更新文件失败：HTTP 401')).toBeDefined();
    expect(screen.getByText('Retry sync')).toBeDefined();
    expect(screen.getByText('Got it')).toBeDefined();

    // "已了解"关闭卡片
    await user.click(screen.getByText('Got it'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('同步成功闪一次绿（successTick 递增驱动瞬态闪光，2s 后回落中性）', () => {
    vi.useFakeTimers();
    render(<SyncStatusDot />);
    const badge = screen.getByRole('status');
    expect(badge.dataset.state).toBe('synced');
    expect(badge.className).toContain('bg-surface-2');

    // 一次新的同步成功 → 转绿 + 小勾
    act(() => markSyncSucceeded());
    expect(badge.className).toContain('bg-success-soft');

    // 2 秒闪光结束后回落中性"已同步"态
    act(() => vi.advanceTimersByTime(2000));
    expect(badge.className).toContain('bg-surface-2');
  });
});