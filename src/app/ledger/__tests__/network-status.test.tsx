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

/**
 * 离线排队功能已下线（AI 结构化本来就要联网+登录，假装能排队只是把
 * "记不上"的问题延后）。这个文件原来叫 offline-queue.test.tsx，测的是
 * "离线时排队、联网后补跑"；现在改测新决定的行为：离线时输入区整个换成
 * 提示卡片（不给提交的机会），以及"看着在线其实不通网"时提交要明确报错
 * 而不是悄悄排队。
 */
describe('主屏 · 已登录时的网络状态', () => {
  it('离线（navigator.onLine=false）时输入区换成提示卡片，不渲染 Composer，历史账目仍可见', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<Home />);

    await waitFor(() =>
      expect(screen.getByText('You need a connection to record')).toBeDefined(),
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
    // 空态账本文案仍然渲染——查看历史不受离线影响（§11.4 local-first）。
    expect(screen.getByText(/No records yet/)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('navigator.onLine 误报为 true（连着 WiFi 但实际不通网）时，提交要明确报网络错误，不再悄悄排队（回归：曾经这种情况会被当成"真离线"塞进排队，用户以为记上了）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '买菜50块');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() =>
      expect(
        screen.getByText('Network connection failed — check your connection and try again'),
      ).toBeDefined(),
    );
    // 失败时原文还回输入框，供重试/编辑（Composer 既有行为，这里只是确认
    // 网络错误没有被特殊处理成"清空输入框假装记上了"）。
    expect(screen.getByRole('textbox')).toHaveProperty('value', '买菜50块');
  });

  it('在线时提交行为不变（回归：网络状态判断不影响既有的正常提交路径）', async () => {
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
    expect(screen.queryByText('You need a connection to record')).toBeNull();
  });
});
