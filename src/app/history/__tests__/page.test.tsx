import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/renderWithLocale';
import HistoryPage from '@/app/history/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { addTransactions, hydrate } from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: crypto.randomUUID(),
  type: 'EXPENSE',
  amountCents: 1000,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: 'x',
  ...over,
});

beforeEach(async () => {
  // 固定「当前月 = 2026-09」，让月份浏览/搜索逃逸/清筛选回当前月都可测
  vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});
afterEach(() => vi.useRealTimers());

describe('历史页', () => {
  it('默认浏览当前月：只显示本月账目，不显示其它月份', async () => {
    await addTransactions([
      tx({ date: '2026-09-10', merchant: '本月咖啡', description: 'now' }),
      tx({ date: '2026-08-15', merchant: '上月机票', description: 'old' }),
    ]);
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('本月咖啡')).toBeDefined());
    expect(screen.queryByText('上月机票')).toBeNull();
  });

  it('切换月份改变可见集合（‹ 到上月）', async () => {
    await addTransactions([
      tx({ date: '2026-09-10', merchant: '本月咖啡' }),
      tx({ date: '2026-08-15', merchant: '上月机票' }),
    ]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('本月咖啡')).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(screen.getByText('上月机票')).toBeDefined());
    expect(screen.queryByText('本月咖啡')).toBeNull();
  });

  it('关键词筛选跨越月份返回当前月之外的匹配（搜索逃逸月范围）', async () => {
    await addTransactions([
      tx({ date: '2026-09-10', merchant: '本地咖啡', description: 'x' }),
      tx({ date: '2026-08-15', merchant: 'TokyoTrip', description: '日本行程' }),
    ]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('本地咖啡')).toBeDefined());
    expect(screen.queryByText('TokyoTrip')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const box = screen.getByRole('searchbox');
    await user.type(box, 'tokyotrip');
    await waitFor(() => expect(screen.getByText('TokyoTrip')).toBeDefined());
    expect(screen.queryByText('本地咖啡')).toBeNull();
  });

  it('清筛选回到「当前月」，而不是筛选前浏览的那个月', async () => {
    await addTransactions([
      tx({ date: '2026-09-10', merchant: '本月咖啡' }),
      tx({ date: '2026-08-15', merchant: '上月机票' }),
    ]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('本月咖啡')).toBeDefined());

    // 先浏览到上月
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(screen.getByText('上月机票')).toBeDefined());

    // 应用一个命不中的筛选，进入筛选空态
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox'), '不存在的关键词');
    await waitFor(() =>
      expect(screen.getByText(/No matching records/)).toBeDefined(),
    );

    // 清筛选：应回当前月（显示本月咖啡），而不是还原成此前浏览的八月
    await user.click(screen.getByRole('button', { name: 'Clear filter' }));
    await waitFor(() => expect(screen.getByText('本月咖啡')).toBeDefined());
    expect(screen.queryByText('上月机票')).toBeNull();
  });

  it('当前月无账目且无筛选时用 emptyLedger 空态，筛选空时用 historyNoResults', async () => {
    await addTransactions([
      tx({ date: '2026-09-10', merchant: '本月咖啡' }),
      tx({ date: '2026-06-05', merchant: '六月记录' }),
    ]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('本月咖啡')).toBeDefined());

    // 回退到 8 月——两笔账之间没有账目的「中间空月」→ emptyLedger
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(screen.getByText(/No records yet/)).toBeDefined());

    // 打开搜索、输入命不中的词 → historyNoResults（与 emptyLedger 文案不同）
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    await waitFor(() => expect(screen.getByText(/No matching records/)).toBeDefined());
  });

  it('同日多币种渲染多条 per-currency 小计 chip（Global Constraint 2 的页面层验证）', async () => {
    await addTransactions([
      tx({ currency: 'AUD', amountCents: 1000, date: '2026-09-10', merchant: '澳元' }),
      tx({ currency: 'USD', amountCents: 2000, date: '2026-09-10', merchant: '美元' }),
    ]);
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('澳元')).toBeDefined());
    expect(screen.getByText('-10.00 AUD')).toBeDefined();
    expect(screen.getByText('-20.00 USD')).toBeDefined();
  });
});