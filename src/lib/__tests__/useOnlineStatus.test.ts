import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

describe('useOnlineStatus', () => {
  it('初始值取自 navigator.onLine', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it('offline 事件把状态翻成 false，online 事件翻回 true', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    act(() => window.dispatchEvent(new Event('offline')));
    expect(result.current).toBe(false);

    act(() => window.dispatchEvent(new Event('online')));
    expect(result.current).toBe(true);
  });

  it('卸载后不再监听事件（不会因为已卸载的组件报状态更新警告）', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    unmount();
    act(() => window.dispatchEvent(new Event('offline')));
    // 卸载后 result.current 冻结在卸载前那一刻的值，不会再变
    expect(result.current).toBe(true);
  });
});
