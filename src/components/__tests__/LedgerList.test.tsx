import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { LedgerList } from '@/components/LedgerList';
import { formatAmount } from '@/components/TransactionRow';
import { markUnsynced, markSynced, getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
import type { Transaction } from '@/lib/ai/schema';

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
  ...over,
});

describe('formatAmount', () => {
  it('整数分渲染为两位小数', () => {
    expect(formatAmount(5430, 'AUD')).toBe('54.30');
    expect(formatAmount(1, 'AUD')).toBe('0.01');
    expect(formatAmount(240000, 'AUD')).toBe('2400.00');
  });
});

describe('LedgerList', () => {
  it('空列表给出提示而非空白', () => {
    render(<LedgerList transactions={[]} />);
    expect(screen.getByText(/No records yet/)).toBeDefined();
  });

  it('渲染商户与描述', () => {
    render(<LedgerList transactions={[tx('a', { merchant: 'Woolworths', description: '买菜' })]} />);
    expect(screen.getByText('Woolworths')).toBeDefined();
    expect(screen.getByText('买菜')).toBeDefined();
  });

  it('category 显示为本地化 label（默认 en），底层仍是稳定英文 key', () => {
    render(<LedgerList transactions={[tx('a', { category: 'TRANSPORT' })]} />);
    expect(screen.getByText('Transport')).toBeDefined();
  });

  it('支出显示负号，收入显示正号', () => {
    render(
      <LedgerList
        transactions={[
          tx('a', { amountCents: 2500 }),
          tx('b', { type: 'INCOME', category: 'SALARY', amountCents: 500000 }),
        ]}
      />,
    );
    expect(screen.getByText('-25.00')).toBeDefined();
    expect(screen.getByText('+5000.00')).toBeDefined();
  });

  it('按日期分组，每个日期只出现一个标题', () => {
    render(
      <LedgerList
        transactions={[
          tx('a', { date: '2026-09-04' }),
          tx('b', { date: '2026-09-04' }),
          tx('c', { date: '2026-09-03' }),
        ]}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });
});

describe('同步状态圆点', () => {
  beforeEach(() => markSynced(getSyncSnapshot().unsyncedIds));

  it('未同步的账目显示空心圆点', () => {
    markUnsynced(['a']);
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.getByText('○')).toBeDefined();
  });

  it('已同步的账目显示实心圆点', () => {
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.getByText('●')).toBeDefined();
  });
});
