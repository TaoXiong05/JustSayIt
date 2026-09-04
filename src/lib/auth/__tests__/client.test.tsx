import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// client.ts 的模块级 session 状态跨测试残留，用 vi.resetModules() 让每个
// 测试获得独立模块实例（等价于浏览器每次刷新页面）。
describe('useSession', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('加载后返回用户', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: { googleSub: 's1', email: 'a@b.c', name: 'A', picture: null },
        }),
      }),
    );
    const { useSession } = await import('@/lib/auth/client');
    function Probe() {
      const s = useSession();
      return <div>{s.loading ? 'loading' : s.user ? s.user.googleSub : 'none'}</div>;
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('s1')).toBeTruthy());
  });

  it('接口失败时 user 为 null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { useSession } = await import('@/lib/auth/client');
    function Probe() {
      const s = useSession();
      return <div>{s.loading ? 'loading' : s.user ? 'has-user' : 'done'}</div>;
    }
    render(<Probe />);
    await waitFor(() => expect(screen.getByText('done')).toBeTruthy());
  });
});