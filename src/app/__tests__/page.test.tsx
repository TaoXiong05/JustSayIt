import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('主屏', () => {
  it('提交后账目出现在列表中', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
              date: '2026-09-04',
              category: 'FOOD',
              merchant: '麦当劳',
              description: '早餐',
            },
          ],
        }),
      }),
    );

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.getByText('-25.00')).toBeDefined();
  });

  it('后端返回空数组时不新增账目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '今天天气不错');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getByText(/还没有记录/)).toBeDefined());
  });
});
