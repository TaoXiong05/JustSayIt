import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { stubLocation } from '@/test/mockLocation';
import SettingsPage from '@/app/settings/page';

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/pwa/storage', () => ({
  getStorageEstimate: vi.fn().mockResolvedValue({ usageBytes: 1024 * 1024, quotaBytes: 100 * 1024 * 1024 }),
}));
vi.mock('@/lib/sync/export', () => ({ exportBackup: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('设置页', () => {
  it('显示账号邮箱与存储用量（标题和数值分开渲染，标题是卡片标题，不是数值前缀）', async () => {
    render(<SettingsPage />);
    expect(screen.getByText('u@example.com')).toBeDefined();
    // 用量卡片整块要等 getStorageEstimate() resolve 后才挂载（含标题）
    await waitFor(() => expect(screen.getByText('1.00 MB / 100.00 MB')).toBeDefined());
    expect(screen.getByText('Local storage')).toBeDefined();
    // 进度条：1MB / 100MB = 1%
    const bar = screen.getByRole('progressbar', { name: 'Local storage' });
    expect(bar.getAttribute('aria-valuenow')).toBe('1');
  });

  it('点登出调用 fetchLogout 并跳登录页（登出后直接给终点，不回访客账本）', async () => {
    const { fetchLogout } = await import('@/lib/auth/client');
    const location = stubLocation();
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(fetchLogout).toHaveBeenCalled();
    await waitFor(() => expect(window.location.href).toBe('/login'));
    location.restore();
  });

  it('点导出备份调用 exportBackup', async () => {
    const { exportBackup } = await import('@/lib/sync/export');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalled();
  });
});
