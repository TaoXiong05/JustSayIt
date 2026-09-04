import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LedgerList } from '@/components/LedgerList';
import { formatAmount } from '@/components/TransactionRow';
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
    expect(screen.getByText(/还没有记录/)).toBeDefined();
  });

  it('渲染商户与描述', () => {
    render(<LedgerList transactions={[tx('a', { merchant: 'Woolworths', description: '买菜' })]} />);
    expect(screen.getByText('Woolworths')).toBeDefined();
    expect(screen.getByText('买菜')).toBeDefined();
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
