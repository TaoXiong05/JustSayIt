import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/ledger/page';
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
    // 用 selector 限定在排队行内部：受控 <textarea> 会把值镜像成自己的
    // 文本节点（用户看到的输入框其实已经清空了，清的是 value），裸的
    // getByText 会同时命中排队行和输入框，取决于清空提交在哪一刻落地，
    // 整套跑起来时会间歇性地报"找到多个元素"。同 optimistic.test.tsx。
    expect(
      screen.getByText('买菜50块', { selector: 'li[aria-live="polite"] span' }),
    ).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('navigator.onLine 误报为 true（连着 WiFi 但实际不通网）时，fetch 失败也要落入排队而不是报错（回归：曾经预检通过后 fetch 抛出的 TypeError 被当成 AI 结构化失败直接展示给用户）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '买菜50块');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/Queued offline/)).toBeDefined());
    expect(screen.queryByRole('alert')).toBeNull();
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

    await waitFor(() => expect(screen.getByText('25.00')).toBeDefined());
    expect(screen.queryByText(/Queued offline/)).toBeNull();
  });
});