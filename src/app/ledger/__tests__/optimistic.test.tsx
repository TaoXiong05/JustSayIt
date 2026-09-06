import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/ledger/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

// Mock 认证：默认已登录，避免 /api/auth/session 的网络 fetch 干扰乐观 UI 断言，
// 并让 Composer（提交入口）在测试中渲染。
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));

// 乐观 UI 测试聚焦提交瞬间的占位行为；自动同步 mock 为空避免干扰 fetch。
vi.mock('@/lib/sync/init', () => ({ initSync: () => () => {} }));

const oneRecord = {
  type: 'EXPENSE',
  amount: 25,
  currency: null,
  date: '2026-09-04',
  category: 'FOOD',
  merchant: '麦当劳',
  description: '早餐',
};

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('乐观 UI', () => {
  it('提交瞬间出现占位行，不等待接口返回', async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((r) => (release = r))),
    );

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // 接口尚未返回，占位行已经在了
    // 注：受控 textarea 在无 defaultValue 时，React 每次更新都会同步
    // element.defaultValue（进而同步 textContent），所以未 resolve 时
    // Composer 自身的 <textarea> 与占位行会有完全相同的文本节点，
    // 裸的 getByText 在此处天然二义——用 selector 把查询限定在占位行的
    // <li aria-live="polite"> 内部，消除歧义（不改变测试意图）。
    expect(
      await screen.findByText('早餐麦当劳25', { selector: 'li[aria-live="polite"] span' }),
    ).toBeDefined();
    expect(screen.getByText(/Processing/)).toBeDefined();

    release({ ok: true, json: async () => ({ records: [oneRecord] }) });
    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.queryByText(/Processing/)).toBeNull();
  });

  it('结果落地后显示飞入确认动画，不再有撤销按钮（用户反馈：改成纯视觉确认，去掉撤销入口）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/Recorded 1 item/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('连续两次提交时，第二批的确认动画重新挂载（key 变化），不会残留两份', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText(/Recorded 1 item/);

    // 第二批：lastAdded 换成新一批 id，key 变化强制 AddedFlash 重新挂载——
    // 不是在原有那份基础上叠加，旧的应该被替换掉而不是残留。
    await user.type(screen.getByRole('textbox'), '午餐麦当劳30');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getAllByText(/Recorded 1 item/)).toHaveLength(1));
  });

  it('失败时占位行消失且输入内容保留', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const user = userEvent.setup();
    render(<Home />);
    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.queryByText(/Processing/)).toBeNull());
    expect((box as HTMLTextAreaElement).value).toBe('早餐麦当劳25');
  });
});
