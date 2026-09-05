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

  it('展开的当天列表是固定高度内部滚动的容器，不是让整个页面变高（回归：用户反馈应跟主屏最近记录一致）', async () => {
    await addTransactions([
      tx({ date: '2026-09-05', merchant: '今天买菜' }),
    ]);
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('今天买菜')).toBeDefined());
    // 今天默认展开，账目行所在的 <ul> 就是那个可滚动容器
    const row = screen.getByText('今天买菜');
    const list = row.closest('ul');
    expect(list?.className).toContain('max-h-64');
    expect(list?.className).toContain('overflow-y-auto');
  });
});

describe('按天折叠（UX brief 要求：今天默认展开，其余天默认收起）', () => {
  it('今天这组默认展开，更早的一天默认收起', async () => {
    // 系统时间钉在 2026-09-05，"今天"就是这一天
    await addTransactions([
      tx({ date: '2026-09-05', merchant: '今天买菜' }),
      tx({ date: '2026-09-01', merchant: '月初买菜' }),
    ]);
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('今天买菜')).toBeDefined());
    const todayHeader = screen.getAllByRole('button', { name: /Sep 5/ })[0];
    const earlierHeader = screen.getAllByRole('button', { name: /Sep 1/ })[0];
    expect(todayHeader.getAttribute('aria-expanded')).toBe('true');
    // 更早一天默认收起：账目行还在 DOM 里（不是没渲染），但被折叠容器
    // 收起——用 grid-rows-[0fr] 的高度折叠，不是 display:none。
    expect(earlierHeader.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('月初买菜')).toBeDefined();
  });

  it('点天头可以展开/收起对应的那一天', async () => {
    await addTransactions([tx({ date: '2026-09-01', merchant: '月初买菜' })]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await waitFor(() => expect(screen.getByText('月初买菜')).toBeDefined());
    const dayHeaderButtons = screen.getAllByRole('button', { name: /Sep 1/ });
    expect(dayHeaderButtons).toHaveLength(1);
    expect(dayHeaderButtons[0].getAttribute('aria-expanded')).toBe('false');
    await user.click(dayHeaderButtons[0]);
    expect(dayHeaderButtons[0].getAttribute('aria-expanded')).toBe('true');
    await user.click(dayHeaderButtons[0]);
    expect(dayHeaderButtons[0].getAttribute('aria-expanded')).toBe('false');
  });

  it('搜索命中的天强制展开，即便不是今天也没被手动点开过', async () => {
    await addTransactions([
      tx({ date: '2026-08-01', merchant: 'Woolworths', description: '很久以前' }),
    ]);
    const user = userEvent.setup();
    render(<HistoryPage />);
    await user.type(screen.getByRole('searchbox'), 'woolworths');
    await waitFor(() => expect(screen.getByText('Woolworths')).toBeDefined());
    const dayHeaderButtons = screen.getAllByRole('button', { name: /Aug 1/ });
    expect(dayHeaderButtons[0].getAttribute('aria-expanded')).toBe('true');
  });
});