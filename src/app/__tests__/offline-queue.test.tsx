import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});
afterEach(() => vi.restoreAllMocks());

describe('主屏 · 离线队列', () => {
  it('离线时提交不发请求，落入排队队列并显示待处理', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '买菜50块');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/Queued offline/)).toBeDefined());
    expect(screen.getByText('买菜50块')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('在线时提交行为不变（回归：不因为加了离线分支而破坏既有路径）', async () => {
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
              date: '2026-09-05',
              category: 'FOOD',
              merchant: null,
              description: '早餐',
            },
          ],
        }),
      }),
    );
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('-25.00')).toBeDefined());
    expect(screen.queryByText(/Queued offline/)).toBeNull();
  });
});