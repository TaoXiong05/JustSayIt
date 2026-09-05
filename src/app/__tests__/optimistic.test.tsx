import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { Toaster } from '@/components/Toaster';
import { resetToastStoreForTests, getSnapshot } from '@/lib/toast';
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
  resetToastStoreForTests();
  await clearAllEvents();
  await hydrate();
});

/** UndoToast 现在把数据交给全局 <Toaster /> 渲染，页面测试需一并挂载 */
function renderHome() {
  return render(
    <>
      <Home />
      <Toaster />
    </>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe('乐观 UI', () => {
  it('提交瞬间出现占位行，不等待接口返回', async () => {
    let release: (v: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((r) => (release = r))),
    );

    const user = userEvent.setup();
    renderHome();
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

  it('结果落地后显示已记录 N 笔与撤销按钮', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/Recorded 1 item/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDefined();
  });

  it('点击撤销移除刚记的账目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByText('麦当劳');
    await user.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(screen.queryByText('麦当劳')).toBeNull());
    expect(screen.getByText(/No records yet/)).toBeDefined();
  });

  it('连续两次提交时，两批各自产生一条独立 toast（key 重挂载 → 每次重新 push）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getAllByText(/Recorded 1 item/)).toHaveLength(1));
    expect(getSnapshot()).toHaveLength(1);

    // 第二批：同 count 的连续提交。若 UndoToast 不因 key 变化重新挂载，
    // effect 依赖（count/unsyncedCount）未变就不会重新 push——key 强制
    // 重挂载保证每批各推进一条 toast。Radix 给每条 toast 独立自动关闭
    // 计时器，两批互不干扰（替代旧实现里手动 setTimeout 的等价语义）。
    await user.type(screen.getByRole('textbox'), '午餐麦当劳30');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getAllByText(/Recorded 1 item/)).toHaveLength(2));
    expect(getSnapshot()).toHaveLength(2);
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
