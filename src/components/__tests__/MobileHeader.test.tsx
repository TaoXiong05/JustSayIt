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

// 同步状态点已经挪去 ledger/page.tsx（"近期账单"标题旁），页眉这个位置
// 换成了安装入口——这里只确认接线接对了，InstallNavButton 自己的平台
// 判定逻辑见 InstallNavButton.test.tsx。
vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(() => false), isStandalone: vi.fn(() => false) }));
vi.mock('@/lib/pwa/install', () => ({
  canPromptInstall: vi.fn(() => true),
  promptInstall: vi.fn(),
}));

describe('MobileHeader（移动端全局页眉：品牌 logo + 安装入口/语言/头像，不含导航）', () => {
  it('渲染品牌 logo 链接回主屏', () => {
    render(<MobileHeader />);
    expect(screen.getByRole('link', { name: 'JustSayIt' })).toHaveProperty(
      'href',
      'http://localhost:3000/ledger',
    );
  });

  it('渲染安装入口、语言切换和头像', async () => {
    render(<MobileHeader />);
    expect(await screen.findByRole('button', { name: 'Install' })).toBeDefined();
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
