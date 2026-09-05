import { describe, it, expect, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { stubLocation } from '@/test/mockLocation';
import RootRedirect from '@/app/page';

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ useSession }));

describe('根路径 /（按登录态分流到 /login 或 /ledger）', () => {
  it('未登录时跳转到 /login', async () => {
    useSession.mockReturnValue({ user: null, loading: false });
    const location = stubLocation();
    render(<RootRedirect />);
    await waitFor(() => expect(window.location.href).toBe('/login'));
    location.restore();
  });

  it('已登录时跳转到 /ledger', async () => {
    useSession.mockReturnValue({
      user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
      loading: false,
    });
    const location = stubLocation();
    render(<RootRedirect />);
    await waitFor(() => expect(window.location.href).toBe('/ledger'));
    location.restore();
  });

  it('session 仍在加载时不跳转', () => {
    useSession.mockReturnValue({ user: null, loading: true });
    const location = stubLocation('http://localhost:3000/');
    render(<RootRedirect />);
    expect(window.location.href).toBe('http://localhost:3000/');
    location.restore();
  });
});
