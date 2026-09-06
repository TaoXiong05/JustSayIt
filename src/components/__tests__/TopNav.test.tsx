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

// 同步状态点已经挪去 ledger/page.tsx（"近期账单"标题旁），这里只需要确认
// 页眉留出的位置换成了安装入口，不用把 InstallNavButton 自己的平台判定
// 逻辑在这个测试里重新验一遍（那部分见 InstallNavButton.test.tsx）。
vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(() => false), isStandalone: vi.fn(() => false) }));
vi.mock('@/lib/pwa/install', () => ({
  canPromptInstall: vi.fn(() => true),
  promptInstall: vi.fn(),
}));

beforeEach(() => {
  usePathname.mockReturnValue('/ledger');
});

describe('TopNav（桌面端全局顶部导航，替代原侧边栏）', () => {
  it('渲染品牌名链接回主屏，三个导航入口并点亮当前页', () => {
    render(<TopNav />);
    expect(screen.getByRole('link', { name: 'JustSayIt' })).toHaveProperty(
      'href',
      'http://localhost:3000/ledger',
    );
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty(
      'href',
      'http://localhost:3000/ledger',
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

  it('右侧渲染安装入口、语言切换和头像——语言切换/头像原先只长在主屏 header 里，现在是全局的；安装入口取代了原来长在这里的同步状态点（同步状态点挪去了 ledger 页"近期账单"标题旁）', async () => {
    render(<TopNav />);
    expect(await screen.findByRole('button', { name: 'Install' })).toBeDefined();
    expect(screen.getByRole('button', { name: '中文' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveProperty(
      'href',
      'http://localhost:3000/settings',
    );
  });
});
