import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // 总支出 10+5=15.00：分类段自己的总支出 + 页面底部的月度总览各出现一次
    expect(screen.getAllByText('15.00').length).toBeGreaterThan(0);
  });

  it('展开某个分类看明细，明细行是可编辑的 TransactionRow（同一组件）', async () => {
    await addTransactions([tx({ category: 'FOOD', description: '买菜' })]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    fireEvent.click(screen.getByText('Food'));
    // 描述现在跟分类 label 拼在同一个文本节点里（"买菜 · Food"，参考设计的
    // 副标题样式），精确匹配已不适用，改用子串匹配。
    expect(screen.getByText('买菜', { exact: false })).toBeDefined();
    // 点明细行能进入编辑态——证明复用的是主屏同一个 TransactionRow
    fireEvent.click(screen.getByText('买菜', { exact: false }));
    expect(screen.getByLabelText('Description')).toBeDefined();
  });

  it('共享 MonthSwitcher：切换月份后统计按该月口径重算', async () => {
    await addTransactions([
      tx({ date: '2026-09-15', category: 'FOOD', amountCents: 1000, description: '本月' }),
      tx({ date: '2026-08-15', category: 'TRANSPORT', amountCents: 500, description: '上月' }),
    ]);
    const user = userEvent.setup();
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    expect(screen.queryByText('Transport')).toBeNull();

    // MonthSwitcher 现在页面顶部只有一份（不再是移动端一份、桌面侧边栏
    // 再一份），直接找即可。
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(screen.getByText('Transport')).toBeDefined());
    expect(screen.queryByText('Food')).toBeNull();
  });

  it('没有记录时显示空态文案', async () => {
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText(/Nothing recorded/)).toBeDefined());
  });

  it('展开的分类明细是固定高度内部滚动的容器，不是让整个页面变高（同 History 展开天/主屏最近记录）', async () => {
    await addTransactions([tx({ category: 'FOOD', description: '买菜' })]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('Food')).toBeDefined());
    fireEvent.click(screen.getByText('Food'));
    const row = screen.getByText('买菜', { exact: false });
    const list = row.closest('ul');
    expect(list?.className).toContain('max-h-64');
    expect(list?.className).toContain('overflow-y-auto');
  });
});

describe('统计页 · 多币种', () => {
  /** 找到某个币种那一段的 <section>（金额本身不带货币符号，只能靠段落标题区分）。 */
  function sectionFor(currency: string): HTMLElement {
    const heading = screen.getByText(currency);
    const section = heading.closest('section');
    if (!section) throw new Error(`没找到 ${currency} 对应的 section`);
    return section;
  }

  it('每个币种分段都标出自己的币种，用户能分辨两段裸数字（不做汇率换算）', async () => {
    await addTransactions([
      tx({ currency: 'AUD', category: 'FOOD', amountCents: 1000, description: '买菜' }),
      tx({ currency: 'USD', category: 'TRANSPORT', amountCents: 500, description: 'taxi' }),
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('AUD')).toBeDefined());
    expect(screen.getByText('USD')).toBeDefined();
  });

  it('同名分类出现在两个币种里时，展开一个不会连带展开另一个', async () => {
    await addTransactions([
      tx({ currency: 'AUD', category: 'FOOD', amountCents: 1000, description: '澳元买菜' }),
      tx({ currency: 'USD', category: 'FOOD', amountCents: 500, description: '美元买菜' }),
    ]);
    render(<StatsPage />);
    await waitFor(() => expect(screen.getByText('AUD')).toBeDefined());

    // 分类按钮的可访问名现在包含金额文本（按钮内聚了图标+标签+金额）→ 用正则匹配
    fireEvent.click(within(sectionFor('AUD')).getByRole('button', { name: /Food/ }));

    expect(within(sectionFor('AUD')).getByText('澳元买菜', { exact: false })).toBeDefined();
    expect(within(sectionFor('USD')).queryByText('美元买菜')).toBeNull();
  });
});
