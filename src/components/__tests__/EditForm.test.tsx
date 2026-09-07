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
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByLabelText('Amount')).toHaveProperty('value', '25.00');
    expect(screen.getByLabelText('Date')).toHaveProperty('value', '2026-09-05');
    expect(screen.getByLabelText('Merchant')).toHaveProperty('value', 'Woolworths');
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
    expect(screen.getByLabelText('Category')).toHaveProperty('value', 'FOOD');
  });

  it('category 下拉只列出与 type 匹配的分类（EXPENSE 不出现 SALARY）', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} />);
    const select = screen.getByLabelText('Category') as HTMLSelectElement;
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('FOOD');
    expect(values).toContain('OTHER');
    expect(values).not.toContain('SALARY');
  });

  it('保存时把改动的字段（含金额换算成整数分）传给 onSave', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} />);
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
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a positive amount with at most 2 decimals')).toBeDefined();
  });

  it('日期被清空时点保存不调用 onSave，显示日期错误提示（不是金额那条）', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid date (YYYY-MM-DD)')).toBeDefined();
  });

  it('日期格式不是 YYYY-MM-DD 时同样拒绝保存', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-9-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid date (YYYY-MM-DD)')).toBeDefined();
  });

  it('商户留空时传 null（不是空字符串）', () => {
    const onSave = vi.fn();
    render(<EditForm transaction={tx} onSave={onSave} onDelete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ merchant: null }));
  });

  // 删除是两步：入口只切到确认态，不删任何东西；只有确认态里那个 Delete
  // 才真的调 onDelete。撤销入口是明确要去掉的（见 AddedFlash.tsx），删除在
  // UI 上不可挽回，所以拦截必须发生在按下之前。
  it('点删除入口只展开确认，不调用 onDelete', () => {
    const onDelete = vi.fn();
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Delete this record?')).toBeDefined();
  });

  it('确认后才真的调用 onDelete', () => {
    const onDelete = vi.fn();
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    // 确认态里入口按钮已被替换掉，同名的 Delete 全场只有一个
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('确认态点取消退回，不删除', () => {
    const onDelete = vi.fn();
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete this record?')).toBeNull();
  });

  // 回归：表单底部原来有一个文字版 Cancel，跟 Save 抢位置又把主按钮挤窄。
  // 取消现在统一走遮罩 / Escape / 头部那个 44px 的 X（见 EditDialog.tsx）。
  it('表单底部没有文字版取消按钮', () => {
    render(<EditForm transaction={tx} onSave={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
