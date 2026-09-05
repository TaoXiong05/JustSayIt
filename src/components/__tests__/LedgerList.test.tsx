import { describe, it, expect, beforeEach, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { LedgerList } from '@/components/LedgerList';
import { formatAmount } from '@/components/TransactionRow';
import { markUnsynced, markSynced, getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
import { amendTransaction, removeTransaction } from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

vi.mock('@/lib/ledger/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ledger/store')>(
    '@/lib/ledger/store',
  );
  return { ...actual, amendTransaction: vi.fn(), removeTransaction: vi.fn() };
});

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
    // 描述现在跟分类 label 拼在同一个文本节点里（"买菜 · Food"，参考设计
    // 的副标题样式），精确匹配已不适用，改用子串匹配。
    expect(screen.getByText('买菜', { exact: false })).toBeDefined();
  });

  it('category 显示为本地化 label（默认 en），底层仍是稳定英文 key', () => {
    render(<LedgerList transactions={[tx('a', { category: 'TRANSPORT' })]} />);
    expect(screen.getByText('Transport', { exact: false })).toBeDefined();
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

describe('点击弹窗编辑（Plan 5 二次改版：原位展开 -> 居中弹窗，见 EditDialog.tsx）', () => {
  it('点击一行弹出编辑弹窗，显示当前字段值', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
  });

  it('保存时调用 amendTransaction 并收起表单', async () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(amendTransaction).toHaveBeenCalledWith('a', expect.any(Object)));
    expect(screen.queryByLabelText('Description')).toBeNull();
  });

  it('点删除调用 removeTransaction 并收起表单', async () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeTransaction).toHaveBeenCalledWith('a'));
  });

  it('点取消关闭弹窗，不调用任何保存/删除', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(amendTransaction).not.toHaveBeenCalled();
    expect(removeTransaction).not.toHaveBeenCalled();
  });

  it('改了字段但按 Escape 关闭 —— 丢弃改动，不调用保存（brief 的"安全取消"要求）', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '改过的描述' } });
    fireEvent.keyDown(screen.getByLabelText('Description'), { key: 'Escape', code: 'Escape' });
    expect(screen.queryByLabelText('Description')).toBeNull();
    expect(amendTransaction).not.toHaveBeenCalled();
  });

  // 背景遮罩点击关闭没有写成自动化用例：Radix 的 DismissableLayer 靠一套
  // 真实的原生 PointerEvent 序列判断"点在 Content 外面"，jsdom 对 Pointer
  // Events 的模拟跟真实浏览器有出入，多次尝试（fireEvent.click、
  // fireEvent.pointerDown、手动派发原生 PointerEvent）在这个环境下都没能
  // 触发 Radix 的判定逻辑。这条路径走的是跟 Escape 完全相同的
  // onOpenChange(false) → 不调用 onSave 的代码，且没有覆写 Radix 默认的
  // onPointerDownOutside，所以逻辑上由上面的 Escape 用例間接覆盖；背景点击
  // 本身是否真的关闭，留给手动/浏览器验证。

  it('重新打开同一笔账，表单是全新挂载——不会带着上次没保存的改动', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '改过但没保存' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
  });
});
