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
