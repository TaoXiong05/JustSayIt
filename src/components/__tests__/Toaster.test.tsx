import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/renderWithLocale';
import { Toaster } from '@/components/Toaster';
import { pushToast, resetToastStoreForTests, getSnapshot } from '@/lib/toast';

beforeEach(() => resetToastStoreForTests());
afterEach(() => vi.useRealTimers());

describe('Toaster', () => {
  it('success 变体渲染 role=status + 消息', async () => {
    render(<Toaster />);
    act(() => pushToast({ variant: 'success', message: 'Recorded 1 item' }));
    expect(await screen.findByText('Recorded 1 item')).toBeDefined();
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('error 变体渲染 role=alert', async () => {
    render(<Toaster />);
    act(() => pushToast({ variant: 'error', message: 'Something failed' }));
    expect(await screen.findByText('Something failed')).toBeDefined();
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('动作按钮触发回调并关闭 toast', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Toaster />);
    act(() =>
      pushToast({
        variant: 'warning',
        message: 'Not synced yet',
        action: { label: 'Retry sync', onClick },
      }),
    );
    await screen.findByText('Not synced yet');
    await user.click(screen.getByRole('button', { name: 'Retry sync' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Not synced yet')).toBeNull());
  });

  it('自动超时后消失（Radix duration 默认时序）', () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => pushToast({ variant: 'warning', message: 'auto-deadline-msg' }));
    expect(screen.getByText('auto-deadline-msg')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    // Radix 到时 → onOpenChange(false) → dismissToast 移出 store 后同步消失；
    // 假计时器下不要用 waitFor（它内部靠 setTimeout 推进，会挂死）。
    expect(screen.queryByText('auto-deadline-msg')).toBeNull();
  });

  it('点关闭按钮触发 onDismiss 并从 store 移除', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Toaster />);
    act(() =>
      pushToast({ variant: 'warning', message: 'dismiss-me', onDismiss }),
    );
    await screen.findByText('dismiss-me');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('dismiss-me')).toBeNull());
    expect(getSnapshot()).toHaveLength(0);
  });
});