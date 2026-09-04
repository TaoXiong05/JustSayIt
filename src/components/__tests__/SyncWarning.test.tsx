import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SyncWarning } from '@/components/SyncWarning';
import {
  markUnsynced,
  markSynced,
  markAuthError,
  clearAuthError,
  getSnapshot,
} from '@/lib/sync/status';

vi.mock('@/lib/sync/export', () => ({ exportBackup: vi.fn() }));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn() }));

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
});
afterEach(() => vi.useRealTimers());

describe('SyncWarning', () => {
  it('没有未同步项、没有 authError 时不渲染任何内容', () => {
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('未同步不足 24 小时时不渲染横幅（spec §8.4：<24h 只用状态点，不打扰）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    markUnsynced(['tx1']);
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('24-72 小时之间渲染持久横幅', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z')); // +36h
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });

  it('超过 72 小时渲染模态，含重试同步与导出备份两个动作', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z')); // +72h
    render(<SyncWarning />);
    expect(screen.getByText(/unsynced for a while/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeDefined();
  });

  it('authError 时立刻渲染提示，不看时间阈值（A 类失败，spec §8.3）', () => {
    markAuthError();
    render(<SyncWarning />);
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
  });
});