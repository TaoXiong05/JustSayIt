import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@/test/renderWithLocale';
import { AccountSwitchGuard } from '@/components/AccountSwitchGuard';
import { clearAllEvents } from '@/lib/ledger/db';
import { addTransactions, hydrate, getSnapshot } from '@/lib/ledger/store';
import { markUnsynced, markSynced, getSnapshot as getSyncSnapshot } from '@/lib/sync/status';
import type { Transaction } from '@/lib/ai/schema';

vi.mock('@/lib/auth/client', () => ({ useSession: vi.fn() }));
import { useSession } from '@/lib/auth/client';

const USER_A = { googleSub: 'sub-a', email: 'a@example.com', name: null, picture: null };
const USER_B = { googleSub: 'sub-b', email: 'b@example.com', name: null, picture: null };

const tx = (id: string): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 1000,
  currency: 'AUD',
  date: '2026-09-08',
  category: 'FOOD',
  merchant: null,
  description: 'x',
});

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
  markSynced(getSyncSnapshot().unsyncedIds);
  vi.mocked(useSession).mockReturnValue({ user: null, loading: true });
});

/**
 * 本地账本按设备存、不按 Google 账号分（events.ts 只记 deviceId，没有
 * userId/googleSub）——共享设备先后登录不同账号时，后一个人会看到并能
 * 编辑/删除同一份本地数据。这套 guard 检测账号切换、弹一个必须二选一
 * 才能关掉的提示（Q11：不允许背景点击/Escape 白划走）。
 */
describe('AccountSwitchGuard', () => {
  it('这台设备第一次见到任何账号登录：不弹提示，只记下这个账号', async () => {
    vi.mocked(useSession).mockReturnValue({ user: USER_A, loading: false });
    render(<AccountSwitchGuard />);
    await waitFor(() => expect(localStorage.getItem('justsayit.lastAccountGoogleSub')).toBe('sub-a'));
    expect(screen.queryByText('Different Google account detected')).toBeNull();
  });

  it('同一个账号再次登录：不弹提示', async () => {
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_A, loading: false });
    render(<AccountSwitchGuard />);
    await waitFor(() => screen.getByText); // 让 effect 有机会跑
    expect(screen.queryByText('Different Google account detected')).toBeNull();
  });

  it('检测到不同账号、本地数据已全部同步：弹出提示，措辞是"安全"版本', async () => {
    await addTransactions([tx('t1')]);
    markSynced(['t1']); // 显式标记已同步，跟前面 beforeEach 的清理相互独立、意图清楚
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_B, loading: false });

    render(<AccountSwitchGuard />);
    await waitFor(() => expect(screen.getByText('Different Google account detected')).toBeDefined());
    expect(
      screen.getByText(/everything in it is already synced/),
    ).toBeDefined();
  });

  it('检测到不同账号、本地有未同步数据：措辞升级成"清空会永久丢失/保留可能泄漏"版本，且带上具体条数', async () => {
    await addTransactions([tx('t1'), tx('t2')]);
    markUnsynced(['t1', 't2']);
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_B, loading: false });

    render(<AccountSwitchGuard />);
    await waitFor(() =>
      expect(screen.getByText(/2 of its entries have never synced anywhere/)).toBeDefined(),
    );
  });

  it('点"清空本机数据"：本地账本被清空，未同步集合也被清掉，且记下新账号', async () => {
    await addTransactions([tx('t1')]);
    markUnsynced(['t1']);
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_B, loading: false });

    render(<AccountSwitchGuard />);
    await waitFor(() => expect(screen.getByText('Different Google account detected')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));

    await waitFor(() => expect(getSnapshot().transactions).toEqual([]));
    expect(getSyncSnapshot().unsyncedIds).toEqual([]);
    expect(localStorage.getItem('justsayit.lastAccountGoogleSub')).toBe('sub-b');
    expect(screen.queryByText('Different Google account detected')).toBeNull();
  });

  it('点"保留不变"：本地账本不受影响，只是记下新账号，弹窗关闭', async () => {
    await addTransactions([tx('t1')]);
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_B, loading: false });

    render(<AccountSwitchGuard />);
    await waitFor(() => expect(screen.getByText('Different Google account detected')).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }));

    await waitFor(() =>
      expect(screen.queryByText('Different Google account detected')).toBeNull(),
    );
    expect(getSnapshot().transactions.map((t) => t.id)).toEqual(['t1']);
    expect(localStorage.getItem('justsayit.lastAccountGoogleSub')).toBe('sub-b');
  });

  it('弹窗打开时不允许 Escape 关闭（阻断式，必须二选一，Q11 决定）', async () => {
    localStorage.setItem('justsayit.lastAccountGoogleSub', 'sub-a');
    vi.mocked(useSession).mockReturnValue({ user: USER_B, loading: false });

    render(<AccountSwitchGuard />);
    await waitFor(() => expect(screen.getByText('Different Google account detected')).toBeDefined());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Different Google account detected')).toBeDefined();
  });
});
