import { describe, it, expect, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { stubLocation } from '@/test/mockLocation';
import LoginPage from '@/app/login/page';

const { useSession } = vi.hoisted(() => ({ useSession: vi.fn() }));
vi.mock('@/lib/auth/client', () => ({ useSession }));

describe('登录营销页（加载中/已登录都不该先闪一下营销内容）', () => {
  it('session 加载中：只显示统一的加载过渡态，不渲染营销内容', () => {
    useSession.mockReturnValue({ user: null, loading: true });
    const { getByRole, queryByText } = render(<LoginPage />);
    expect(getByRole('status')).toBeDefined();
    expect(queryByText('Just say it.')).toBeNull();
  });

  it('未登录：正常渲染营销页', () => {
    useSession.mockReturnValue({ user: null, loading: false });
    const { getByText } = render(<LoginPage />);
    expect(getByText('Just say it.')).toBeDefined();
  });

  it('已登录：不渲染营销内容，直接跳到 /ledger（不经过根路径 /）', async () => {
    useSession.mockReturnValue({
      user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
      loading: false,
    });
    const location = stubLocation();
    const { queryByText } = render(<LoginPage />);
    expect(queryByText('Just say it.')).toBeNull();
    await waitFor(() => expect(window.location.href).toBe('/ledger'));
    location.restore();
  });
});
