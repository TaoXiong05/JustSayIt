import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
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
  it('显示账号邮箱与存储用量', async () => {
    render(<SettingsPage />);
    expect(screen.getByText('u@example.com')).toBeDefined();
    await waitFor(() => expect(screen.getByText('Local storage: 1.00 MB / 100.00 MB')).toBeDefined());
  });

  it('点登出调用 fetchLogout 并跳回主屏（不是留在原地无反馈）', async () => {
    const { fetchLogout } = await import('@/lib/auth/client');
    const originalHref = window.location.href;
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(fetchLogout).toHaveBeenCalled();
    await waitFor(() => expect(window.location.href).toBe('http://localhost:3000/'));
    window.history.pushState({}, '', originalHref);
  });

  it('点导出备份调用 exportBackup', async () => {
    const { exportBackup } = await import('@/lib/sync/export');
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    expect(exportBackup).toHaveBeenCalled();
  });
});
