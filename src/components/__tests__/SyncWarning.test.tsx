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
vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));

import { isIOS, isStandalone } from '@/lib/platform';

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
  vi.mocked(isIOS).mockReturnValue(false);
  vi.mocked(isStandalone).mockReturnValue(false);
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

describe('SyncWarning 平台分支文案（spec §8.6）', () => {
  it('iOS + 未安装时用"可能被清除"文案', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Safari may clear this data/)).toBeDefined();
  });

  it('iOS 但已安装时不用"可能被清除"文案（有 ITP 豁免，spec §8.2）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
    expect(screen.queryByText(/Safari may clear/)).toBeNull();
  });

  it('非 iOS 平台一律用"尚未备份到云端"文案', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    render(<SyncWarning />);
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });
});