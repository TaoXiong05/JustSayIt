import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';

vi.mock('@/lib/pwa/storage', () => ({ requestPersistentStorage: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({ initInstallPromptCapture: vi.fn(() => vi.fn()) }));

import { requestPersistentStorage } from '@/lib/pwa/storage';
import { initInstallPromptCapture } from '@/lib/pwa/install';

beforeEach(() => vi.clearAllMocks());

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
});
