import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import Home from '@/app/ledger/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

// 未登录状态：useSession 返回 user null。验证 §11.4 —— 账本仍可见、
// 输入区被登录引导替代、header 不显示用户信息。
vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({ user: null, loading: false }),
  fetchLogout: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

afterEach(() => vi.restoreAllMocks());

describe('主屏（未登录）', () => {
  it('隐藏输入区、显示登录引导，本地账本仍可见（§11.4）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    render(<Home />);
    await waitFor(() =>
      expect(screen.getByText('Log in to get started')).toBeDefined(),
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    // 登录引导 banner 的行动按钮直接指向 OAuth 端点，不经过 /login 营销页——
    // 已经在用产品的人不需要再看一遍营销话术。
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveProperty(
      'href',
      'http://localhost:3000/api/auth/login',
    );
    // 本地账本区仍渲染（空态文案）
    expect(screen.getByText(/No records yet/)).toBeDefined();
  });

  it('未登录 + 离线：登录按钮换成禁用态，不再是可点的 OAuth 链接（登录本身要走整页跳转，离线时点了也走不通）', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<Home />);
    await waitFor(() =>
      expect(screen.getByText('Signing in needs a connection — reconnect, then continue with Google.')).toBeDefined(),
    );
    expect(screen.queryByRole('link', { name: 'Continue with Google' })).toBeNull();
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    expect(button).toHaveProperty('disabled', true);
  });
});
