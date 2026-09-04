import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { EditForm } from '@/components/EditForm';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: 'Woolworths',
  description: '买菜',
};

describe('EditForm', () => {
  it('字段用当前账目的值预填', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '25.00');
    expect(screen.getByLabelText('Date')).toHaveProperty('value', '2026-09-05');
    expect(screen.getByLabelText('Merchant')).toHaveProperty('value', 'Woolworths');
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
    expect(screen.getByLabelText('Category')).toHaveProperty('value', 'FOOD');
  });

  it('category 下拉只列出与 type 匹配的分类（EXPENSE 不出现 SALARY）', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} onCancel={vi.fn()} />);
    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('FOOD');
    expect(values).toContain('OTHER');
    expect(values).not.toContain('SALARY');
  });

  it('保存时把改动的字段（含金额换算成整数分）传给 onSave', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30.50' } });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'TRANSPORT' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      amountCents: 3050,
      category: 'TRANSPORT',
      date: '2026-09-05',
      merchant: 'Woolworths',
      description: '买菜',
    });
  });

  it('金额不合法时点保存不调用 onSave，显示错误提示', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a positive amount with at most 2 decimals')).toBeDefined();
  });

  it('商户留空时传 null（不是空字符串）', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ merchant: null }));
  });

  it('点删除调用 onDelete，点取消调用 onCancel', () => {
    const onDelete = vi.fn();
    const onCancel = vi.fn();
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={onDelete} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
