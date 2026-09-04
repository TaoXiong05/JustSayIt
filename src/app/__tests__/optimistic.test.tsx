import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Home from '@/app/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

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
    await user.click(screen.getByRole('button', { name: '提交' }));

    // 接口尚未返回，占位行已经在了
    // 注：受控 textarea 在无 defaultValue 时，React 每次更新都会同步
    // element.defaultValue（进而同步 textContent），所以未 resolve 时
    // Composer 自身的 <textarea> 与占位行会有完全相同的文本节点，
    // 裸的 getByText 在此处天然二义——用 selector 把查询限定在占位行的
    // <li aria-live="polite"> 内部，消除歧义（不改变测试意图）。
    expect(
      await screen.findByText('早餐麦当劳25', { selector: 'li[aria-live="polite"] span' }),
    ).toBeDefined();
    expect(screen.getByText(/处理中/)).toBeDefined();

    release({ ok: true, json: async () => ({ records: [oneRecord] }) });
    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.queryByText(/处理中/)).toBeNull();
  });

  it('结果落地后显示已记录 N 笔与撤销按钮', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    expect(await screen.findByText(/已记录 1 笔/)).toBeDefined();
    expect(screen.getByRole('button', { name: '撤销' })).toBeDefined();
  });

  it('点击撤销移除刚记的账目', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [oneRecord] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await screen.findByText('麦当劳');
    await user.click(screen.getByRole('button', { name: '撤销' }));

    await waitFor(() => expect(screen.queryByText('麦当劳')).toBeNull());
    expect(screen.getByText(/还没有记录/)).toBeDefined();
  });

  it('连续两次提交时，UndoToast 随新一批重新挂载，旧计时器被清理、新计时器独立起算（回归：Finding 2）', async () => {
    // 用真实计时器 + 监听 setTimeout/clearTimeout 调用，而不是伪造计时器：
    // 伪造 setTimeout 会连带影响 React scheduler（它优先用 setImmediate，
    // 但对已捕获的 localSetTimeout 引用敏感）与 testing-library 的 waitFor
    // 轮询机制，在这套 jsdom + React 18 组合下会直接挂起测试。
    // 直接断言"关键效果"更稳妥：旧 batch 的计时器是否在第二次提交时被
    // clearTimeout 清理，第二批是否拿到一个全新的 6s 计时器——这正是
    // key={lastAdded.join(',')} 强制重新挂载要保证的两件事，比真的等待
    // 6 秒观察 DOM 更直接、也更快。
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const AUTO_DISMISS_MS = 6000; // 与 UndoToast.tsx 内的常量保持一致

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ records: [oneRecord] }) });
    vi.stubGlobal('fetch', fetchMock);

    const dismissCalls = () =>
      setTimeoutSpy.mock.calls.filter(([, delay]) => delay === AUTO_DISMISS_MS);

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '撤销' })).toBeDefined());
    // useEffect 的挂载是被动效果，在提交后额外 paint 一拍才真正执行——
    // 因此除了等按钮出现，还要单独等 setTimeout 调用本身落地，
    // 否则在并行跑测试时偶发读到"按钮已渲染但 effect 还没跑"的中间态。
    await waitFor(() => expect(dismissCalls()).toHaveLength(1));

    const firstCallIndex = setTimeoutSpy.mock.calls.indexOf(dismissCalls()[0]);
    const firstTimerId = setTimeoutSpy.mock.results[firstCallIndex].value;
    expect(clearTimeoutSpy.mock.calls.some(([id]) => id === firstTimerId)).toBe(false);

    // 第一批的 toast 还显示着时，提交第二批
    await user.type(screen.getByRole('textbox'), '午餐麦当劳30');
    await user.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => expect(screen.getByText(/已记录 1 笔/)).toBeDefined());

    // 修复后：UndoToast 因 key 改变而卸载重挂——旧 effect 的清理函数必须
    // clearTimeout 掉第一批的计时器，新 effect 必须重新 setTimeout 一个
    // 全新的 6s 计时器，而不是复用/延续第一批那个。两者都是被动效果，
    // 同样要用 waitFor 等它们真正执行完，而不是在 DOM 更新的那一拍立刻断言。
    await waitFor(() =>
      expect(clearTimeoutSpy.mock.calls.some(([id]) => id === firstTimerId)).toBe(true),
    );
    await waitFor(() => expect(dismissCalls()).toHaveLength(2));
  });

  it('失败时占位行消失且输入内容保留', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    const user = userEvent.setup();
    render(<Home />);
    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: '提交' }));

    await waitFor(() => expect(screen.queryByText(/处理中/)).toBeNull());
    expect((box as HTMLTextAreaElement).value).toBe('早餐麦当劳25');
  });
});
