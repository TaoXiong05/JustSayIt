import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { UndoToast } from '@/components/UndoToast';

describe('UndoToast', () => {
  it('unsyncedCount > 0 时文案带上待同步', () => {
    render(<UndoToast count={3} unsyncedCount={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Recorded 3 items · pending sync')).toBeDefined();
  });

  it('unsyncedCount 为 0（或不传）时不带待同步字样', () => {
    render(<UndoToast count={3} onUndo={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Recorded 3 items')).toBeDefined();
  });
});