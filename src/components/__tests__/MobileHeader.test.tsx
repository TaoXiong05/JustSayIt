import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { MobileHeader } from '@/components/MobileHeader';

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
}));

describe('MobileHeader（移动端全局页眉：品牌 logo + 同步/语言/头像，不含导航）', () => {
  it('渲染品牌 logo 链接回主屏', () => {
    render(<MobileHeader />);
    expect(screen.getByRole('link', { name: 'JustSayIt' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    );
  });

  it('渲染同步状态、语言切换和头像', () => {
    render(<MobileHeader />);
    expect(screen.getByRole('status')).toBeDefined();
    expect(screen.getByRole('button', { name: '中文' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveProperty(
      'href',
      'http://localhost:3000/settings',
    );
  });

  it('不含记录/历史/统计这类导航链接——导航是底部 tab 栏的事', () => {
    render(<MobileHeader />);
    expect(screen.queryByRole('link', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Stats' })).toBeNull();
  });
});
