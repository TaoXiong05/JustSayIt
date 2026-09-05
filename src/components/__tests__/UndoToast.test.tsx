import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactElement } from 'react';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/renderWithLocale';
import { UndoToast } from '@/components/UndoToast';
import { Toaster } from '@/components/Toaster';
import { resetToastStoreForTests } from '@/lib/toast';

beforeEach(() => resetToastStoreForTests());
afterEach(() => vi.useRealTimers());

describe('UndoToast', () => {
  function renderWithToast(ui: ReactElement) {
    return render(
      <>
        {ui}
        <Toaster />
      </>,
    );
  }

  it('unsyncedCount > 0 时文案带上待同步', async () => {
    renderWithToast(<UndoToast count={3} unsyncedCount={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(await screen.findByText('Recorded 3 items · pending sync')).toBeDefined();
  });

  it('unsyncedCount 为 0（或不传）时不带待同步字样', async () => {
    renderWithToast(<UndoToast count={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(await screen.findByText('Recorded 3 items')).toBeDefined();
  });

  it('点撤销触发 onUndo，toast 关闭', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    renderWithToast(<UndoToast count={1} onUndo={onUndo} onDismiss={onDismiss} />);
    await screen.findByText('Recorded 1 item');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('自动消失时触发 onDismiss（迁移后在 Radix 时序下依然成立）', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    renderWithToast(<UndoToast count={1} onUndo={vi.fn()} onDismiss={onDismiss} />);
    expect(screen.getByText('Recorded 1 item')).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('重新挂载（key 变化）会推进一条新 toast，而不是复用上一条', async () => {
    const { rerender } = render(
      <>
        <UndoToast count={1} onUndo={vi.fn()} onDismiss={vi.fn()} />
        <Toaster />
      </>,
    );
    expect(await screen.findByText('Recorded 1 item')).toBeDefined();
    act(() => resetToastStoreForTests()); // 模拟上一条自然消失

    rerender(
      <>
        <UndoToast
          key="batch-2"
          count={1}
          onUndo={vi.fn()}
          onDismiss={vi.fn()}
        />
        <Toaster />
      </>,
    );
    expect(await screen.findByText('Recorded 1 item')).toBeDefined();
  });
});