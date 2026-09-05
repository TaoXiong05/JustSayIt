import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { TopNav } from '@/components/TopNav';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

vi.mock('@/lib/auth/client', () => ({
  useSession: () => ({
    user: { googleSub: 's1', email: 'u@example.com', name: 'U', picture: null },
    loading: false,
  }),
}));

beforeEach(() => {
  usePathname.mockReturnValue('/');
});

describe('TopNav（桌面端全局顶部导航，替代原侧边栏）', () => {
  it('渲染品牌名链接回主屏，三个导航入口并点亮当前页', () => {
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'JustSayIt' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    );
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty(
      'href',
      'http://localhost:3000/',
    );
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty(
      'href',
      'http://localhost:3000/history',
    );
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty(
      'href',
      'http://localhost:3000/stats',
    );
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('ariaCurrent', 'page');
  });

  it('/history 时对应入口点亮', () => {
    usePathname.mockReturnValue('/history');
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty('ariaCurrent', 'page');
  });

  it('右侧渲染同步状态、语言切换和头像——原先只长在主屏 header 里的三样，现在是全局的', () => {
    render(<TopNav />);
    expect(screen.getByRole('status')).toBeDefined(); // SyncStatusDot
    expect(screen.getByRole('button', { name: '中文' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveProperty(
      'href',
      'http://localhost:3000/settings',
    );
  });
});
