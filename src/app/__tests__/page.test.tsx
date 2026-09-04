import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

// Mock 认证：默认已登录，保证 Plan 1 的既有用例（提交/归并/失败路径）聚焦
// 且不触发 /api/auth/session 的 fetch。未登录分支在单独用例中断言。
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

  it('近似拼写的商户名归并到历史已用过的写法（打通 normalizeMerchant + knownMerchants + handleSubmit）', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // 第一笔：商户名以 'Woolworths' 落地，成为历史已知写法
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            type: 'EXPENSE',
            amount: 10,
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: 'Woolworths',
            description: '第一笔',
          },
        ],
      }),
    });

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '第一笔10');
    await user.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(screen.getByText('Woolworths')).toBeDefined());

    // 第二笔：AI 返回的是近似拼写 'Woolworth'（缺尾部 s），
    // 应归并为已知写法 'Woolworths'，而不是原样保留近似拼写
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            type: 'EXPENSE',
            amount: 20,
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: 'Woolworth',
            description: '第二笔',
          },
        ],
      }),
    });
    await user.type(screen.getByRole('textbox'), '第二笔20');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.getAllByText('Woolworths')).toHaveLength(2));
    expect(screen.queryByText('Woolworth')).toBeNull();
  });

  it('接口返回 ok:true 但形状不合法时不落地任何账目，走失败路径（回归：Finding 4）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        // 形状错误：records 里的记录缺 date 字段——不是网络失败，
        // 是响应体本身不合法（例如反代返回了 200 的 HTML 错误页，
        // 或未来路由改动导致的字段不匹配）
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
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
    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    // 与网络失败同一条路径：占位行消失、Composer 显示失败提示、
    // 原文还回输入框——账本里绝不能出现这条形状不合法的记录
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/还没有记录/)).toBeDefined();
    expect(screen.queryByText('麦当劳')).toBeNull();
    expect((box as HTMLTextAreaElement).value).toBe('早餐麦当劳25');
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
