import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';

vi.mock('@/lib/pwa/storage', () => ({ requestPersistentStorage: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({ initInstallPromptCapture: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/sync/init', () => ({ initSync: vi.fn(() => vi.fn()) }));
vi.mock('@/lib/auth/client', () => ({ useSession: vi.fn() }));

import { requestPersistentStorage } from '@/lib/pwa/storage';
import { initInstallPromptCapture } from '@/lib/pwa/install';
import { initSync } from '@/lib/sync/init';
import { useSession } from '@/lib/auth/client';

const AUTHED_USER = { googleSub: 'u1', email: 'a@b.com', name: null, picture: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({ user: null, loading: false });
});

describe('PersistStorageOnMount（应用外壳级启动副作用）', () => {
  it('挂载时申请持久化存储（spec §6.3）', () => {
    render(<PersistStorageOnMount />);
    expect(requestPersistentStorage).toHaveBeenCalledTimes(1);
  });

  it('挂载时就挂上 beforeinstallprompt 监听——Chrome 只在页面早期派发一次，等到设置页才挂就晚了（spec §8.8）', () => {
    render(<PersistStorageOnMount />);
    expect(initInstallPromptCapture).toHaveBeenCalledTimes(1);
  });

  it('卸载时调用捕获返回的 cleanup（摘监听器，不影响已捕获的事件）', () => {
    const cleanup = vi.fn();
    vi.mocked(initInstallPromptCapture).mockReturnValue(cleanup);
    const { unmount } = render(<PersistStorageOnMount />);
    expect(cleanup).not.toHaveBeenCalled();
    unmount();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('不渲染任何可见内容', () => {
    const { container } = render(<PersistStorageOnMount />);
    expect(container.innerHTML).toBe('');
  });

  it('未登录（含 loading 中）时不启动同步——游客停在任何页面都不该轮询 /api/sync-version', () => {
    vi.mocked(useSession).mockReturnValue({ user: null, loading: true });
    render(<PersistStorageOnMount />);
    expect(initSync).not.toHaveBeenCalled();

    vi.mocked(useSession).mockReturnValue({ user: null, loading: false });
    render(<PersistStorageOnMount />);
    expect(initSync).not.toHaveBeenCalled();
  });

  it('登录后启动同步，不依赖用户停在哪个页面（回归：曾经只在 ledger/page.tsx 挂载 initSync，全程停留在 /history、/stats、/settings 的已登录用户整个会话都不会同步）', () => {
    vi.mocked(useSession).mockReturnValue({ user: AUTHED_USER, loading: false });
    render(<PersistStorageOnMount />);
    expect(initSync).toHaveBeenCalledTimes(1);
  });

  it('登出后停止同步——authed 变回 false 时调用 initSync 返回的 cleanup', () => {
    const cleanup = vi.fn();
    vi.mocked(initSync).mockReturnValue(cleanup);
    vi.mocked(useSession).mockReturnValue({ user: AUTHED_USER, loading: false });
    const { rerender } = render(<PersistStorageOnMount />);
    expect(cleanup).not.toHaveBeenCalled();

    vi.mocked(useSession).mockReturnValue({ user: null, loading: false });
    rerender(<PersistStorageOnMount />);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
