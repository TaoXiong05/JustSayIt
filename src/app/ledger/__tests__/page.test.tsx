import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import userEvent from '@testing-library/user-event';
import Home from '@/app/ledger/page';
import { MobileHeader } from '@/components/MobileHeader';
import { clearAllEvents } from '@/lib/ledger/db';
import { addTransactions, hydrate } from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

// Mock 认证：默认已登录，保证 Plan 1 的既有用例（提交/归并/失败路径）聚焦
// 且不触发 /api/auth/session 的 fetch。未登录分支在单独用例中断言。
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));


beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('主屏 - 最近记录裁剪', () => {
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

  it('超过 10 笔时主屏只渲染最近的 10 笔（replay 天然 date 降序）', async () => {
    for (let i = 1; i <= 12; i++) {
      await addTransactions([
        tx({ date: `2026-09-${String(i).padStart(2, '0')}`, merchant: `商家${i}` }),
      ]);
    }
    render(<Home />);
    // 最新的 10 笔（12..3）在列
    await waitFor(() => expect(screen.getByText('商家12')).toBeDefined());
    expect(screen.getByText('商家11')).toBeDefined();
    expect(screen.getByText('商家4')).toBeDefined();
    expect(screen.getByText('商家3')).toBeDefined();
    // 最旧的 2 笔被裁掉
    expect(screen.queryByText('商家1')).toBeNull();
    expect(screen.queryByText('商家2')).toBeNull();
  });
});

describe('主屏 - 提交/归并/失败路径（Plan 1 既有用例）', () => {
  it('提交后账目出现在列表中', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
              date: '2026-09-04',
              category: 'FOOD',
              merchant: '麦当劳',
              description: '早餐',
            },
          ],
        }),
      }),
    );

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('麦当劳')).toBeDefined());
    expect(screen.getByText('25.00')).toBeDefined();
  });

  it('近似拼写的商户名归并到历史已用过的写法（打通 normalizeMerchant + knownMerchants + handleSubmit）', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    // 第一笔：商户名以 'Woolworths' 落地，成为历史已知写法
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            type: 'EXPENSE',
            amount: 10,
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: 'Woolworths',
            description: '第一笔',
          },
        ],
      }),
    });

    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByRole('textbox'), '第一笔10');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('Woolworths')).toBeDefined());

    // 第二笔：AI 返回的是近似拼写 'Woolworth'（缺尾部 s），
    // 应归并为已知写法 'Woolworths'，而不是原样保留近似拼写
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        records: [
          {
            type: 'EXPENSE',
            amount: 20,
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: 'Woolworth',
            description: '第二笔',
          },
        ],
      }),
    });
    await user.type(screen.getByRole('textbox'), '第二笔20');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getAllByText('Woolworths')).toHaveLength(2));
    expect(screen.queryByText('Woolworth')).toBeNull();
  });

  it('接口返回 ok:true 但形状不合法时不落地任何账目，走失败路径（回归：Finding 4）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        // 形状错误：records 里的记录缺 date 字段——不是网络失败，
        // 是响应体本身不合法（例如反代返回了 200 的 HTML 错误页，
        // 或未来路由改动导致的字段不匹配）
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
              category: 'FOOD',
              merchant: '麦当劳',
              description: '早餐',
            },
          ],
        }),
      }),
    );
    const user = userEvent.setup();
    render(<Home />);
    const box = screen.getByRole('textbox');
    await user.type(box, '早餐麦当劳25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // 与网络失败同一条路径：占位行消失、Composer 显示失败提示、
    // 原文还回输入框——账本里绝不能出现这条形状不合法的记录
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/No records yet/)).toBeDefined();
    expect(screen.queryByText('麦当劳')).toBeNull();
    expect((box as HTMLTextAreaElement).value).toBe('早餐麦当劳25');
  });

  it('后端返回空数组（没识别到任何账目）时不新增账目，且明确提示用户，不是静默无反馈（用户反馈原话：不知道是新增成功了还是失败了）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    const user = userEvent.setup();
    render(<Home />);
    const box = screen.getByRole('textbox');
    await user.type(box, 'sdsadsdsafsdfgasdsad 3');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText(/No records yet/)).toBeDefined());
    // 跟"接口失败"走同一条路径：占位行消失、原文还回输入框方便改写重试、
    // 显示一条不同于"记账失败"的提示（这次调用其实成功了，只是没识别出
    // 账目，措辞不该暗示是请求出错）。
    await waitFor(() =>
      expect(screen.getByText(/Couldn't find anything to record/)).toBeDefined(),
    );
    expect((box as HTMLInputElement).value).toBe('sdsadsdsafsdfgasdsad 3');
  });

  it('切换 UI 语言只改变展示文案，不改变已保存的账本数据（中英文支持 §7、§12 Case 6）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 25,
              currency: null,
              date: '2026-09-04',
              category: 'TRANSPORT',
              merchant: 'Uber',
              description: 'ride',
            },
          ],
        }),
      }),
    );
    const user = userEvent.setup();
    // 语言切换按钮现在是全局页眉（MobileHeader）的一部分，不再是 Home
    // 自己渲染的东西——跟真实布局一样，把两者作为同一个 LocaleProvider
    // 下的兄弟节点渲染，语言状态才是共享的。
    render(
      <>
        <MobileHeader />
        <Home />
      </>,
    );
    await user.type(screen.getByRole('textbox'), 'Uber ride $25');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(screen.getByText('Uber')).toBeDefined());
    // 描述现在跟分类 label 拼在同一个文本节点里（"ride · Transport"，参考
    // 设计的副标题样式），精确匹配已不适用，改用子串匹配。
    expect(screen.getByText('Transport', { exact: false })).toBeDefined();

    // 切到中文：category label 变了，但商户/金额这些底层数据原样还在
    await user.click(screen.getByRole('button', { name: '中文' }));
    expect(screen.getByText('交通', { exact: false })).toBeDefined();
    expect(screen.queryByText('Transport', { exact: false })).toBeNull();
    expect(screen.getByText('Uber')).toBeDefined();
    expect(screen.getByText('25.00')).toBeDefined();

    // 切回英文：反向验证同样成立，且切换是可逆的展示层操作
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Transport', { exact: false })).toBeDefined();
    expect(screen.getByText('Uber')).toBeDefined();
  });
});

describe('主屏布局（用户明确要求：近期账单在上面，主输入区在下面，输入区占约半屏）', () => {
  it('近期账单列表在 DOM 里排在 Composer 前面', () => {
    render(<Home />);
    const composerHeading = screen.getByText('Record anytime, anywhere');
    const recentHeading = screen.getByText('Recent transactions');
    // DOCUMENT_POSITION_FOLLOWING：composerHeading 在 recentHeading 之后
    expect(
      recentHeading.compareDocumentPosition(composerHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('"View all history" 链接指向 /history（History 已有全局导航常驻入口，这里只是首页的快捷方式）', () => {
    render(<Home />);
    expect(screen.getByRole('link', { name: /View all history/ })).toHaveProperty(
      'href',
      'http://localhost:3000/history',
    );
  });

  it('同步状态点渲染在"近期账单"标题旁——原来长在全局页眉里，现在挪到这儿（页眉的位置换成了安装入口，见 TopNav/MobileHeader.test.tsx）', () => {
    render(<Home />);
    const recentHeading = screen.getByText('Recent transactions');
    const statusDot = screen.getByRole('status');
    // DOCUMENT_POSITION_FOLLOWING：statusDot 紧跟在标题后面，同一个 flex 容器里
    expect(
      recentHeading.compareDocumentPosition(statusDot) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
