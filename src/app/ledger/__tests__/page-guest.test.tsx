import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { stubLocation } from '@/test/mockLocation';
import Home from '@/app/ledger/page';
import { clearAllEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

// 未登录状态：useSession 返回 user null。账本页现在要求登录——未登录用户
// 访问 /ledger 被直接送去 /login（他们不需要这个页面来登录；要看本地账本
// 历史去 /history，那是未登录可访问的）。
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
  it('未登录访问 /ledger 直接跳转到 /login，不渲染账本内容', async () => {
    const location = stubLocation();
    render(<Home />);
    await waitFor(() => expect(window.location.href).toBe('/login'));
    location.restore();
  });
});