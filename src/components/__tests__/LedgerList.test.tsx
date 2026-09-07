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

  // 只有收入带正号且着色，支出是裸数字（中性色）：支出是常态，一屏全是
  // 红色负号既没有区分度，又给记账平添压力；收入是稀有事件，加号+绿色才
  // 真正起到"这条不一样"的作用。
  it('收入显示正号，支出不带任何符号', () => {
    render(
      <LedgerList
        transactions={[
          tx('a', { amountCents: 2500 }),
          tx('b', { type: 'INCOME', category: 'SALARY', amountCents: 500000 }),
        ]}
      />,
    );
    expect(screen.getByText('25.00')).toBeDefined();
    expect(screen.queryByText('-25.00')).toBeNull();
    expect(screen.getByText('+5000.00')).toBeDefined();
  });

  // merchant 为 null 时（prompt 规则 9 明确允许），主行降级显示 description，
  // 不再是一个占着主行位置的破折号。
  it('没有商户名时，description 顶到主行且不再出现破折号', () => {
    render(<LedgerList transactions={[tx('a', { merchant: null, description: '早餐' })]} />);
    expect(screen.getByText('早餐')).toBeDefined();
    expect(screen.queryByText('—')).toBeNull();
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

  // 回归：首页原来直接渲染裸的 `2026-09-04`，而 History 页同一份列表显示的是
  // 本地化的 "Fri, Sep 4"——同一个列表在两个页面长得不一样。
  it('日期标题本地化，不再是裸 ISO 字符串', () => {
    render(<LedgerList transactions={[tx('a', { date: '2026-09-04' })]} />);
    expect(screen.queryByText('2026-09-04')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Sep');
  });
});

// 同步标记只在异常态出现：已同步是 99% 的常态，常态不该占视觉预算，
// 也不该占一整列宽度（原来是 ●/○ 两个裸字符各占一列）。
describe('未同步标记', () => {
  beforeEach(() => markSynced(getSyncSnapshot().unsyncedIds));

  it('未同步的账目带一个可读的离线图标', () => {
    markUnsynced(['a']);
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.getByLabelText('Not synced yet')).toBeDefined();
  });

  it('已同步的账目不显示任何同步标记', () => {
    render(<LedgerList transactions={[tx('a')]} />);
    expect(screen.queryByLabelText('Not synced yet')).toBeNull();
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

  // 删除要两步：第一下只展开确认，第二下才真删（见 EditForm.tsx）。
  it('删除需二次确认，确认后调用 removeTransaction 并收起表单', async () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removeTransaction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeTransaction).toHaveBeenCalledWith('a'));
  });

  // 底部那个文字版 Cancel 已去掉，取消统一走头部 44px 的 X（无障碍名 Dismiss）。
  it('点头部关闭按钮关掉弹窗，不调用任何保存/删除', () => {
    render(<LedgerList transactions={[tx('a', { description: '买菜' })]} />);
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    expect(screen.getByLabelText('Description')).toHaveProperty('value', '买菜');
  });
});
