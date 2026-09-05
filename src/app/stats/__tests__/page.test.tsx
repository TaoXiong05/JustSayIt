import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import StatsPage from '@/app/stats/page';
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
  vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});
afterEach(() => vi.useRealTimers());

describe('统计页', () => {
  it('默认显示本月分类汇总与总支出', async () => {
    await addTransactions([
      tx({ category: 'FOOD', amountCents: 1000, description: '买菜' }),
      tx({ category: 'TRANSPORT', amountCents: 500, description: '打车' }),
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    expect(screen.getByText('Transport')).toBeDefined();
    expect(screen.getByText('15.00')).toBeDefined(); // 总支出 10+5
  });

  it('展开某个分类看明细，明细行是可编辑的 TransactionRow（同一组件）', async () => {
    await addTransactions([tx({ category: 'FOOD', description: '买菜' })]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    fireEvent.click(screen.getByText('Food'));
    expect(screen.getByText('买菜')).toBeDefined();
    // 点明细行能进入编辑态——证明复用的是主屏同一个 TransactionRow
    fireEvent.click(screen.getByText('买菜'));
    expect(screen.getByLabelText('Description')).toBeDefined();
  });

  it('周/月切换改变统计口径', async () => {
    await addTransactions([
      tx({ date: '2026-09-01', category: 'FOOD', amountCents: 1000 }), // 本月，不在本周
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('10.00')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => expect(screen.getByText(/Nothing recorded/)).toBeDefined());
  });

  it('没有记录时显示空态文案', async () => {
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText(/Nothing recorded/)).toBeDefined());
  });
});
