import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { InstallBanner } from '@/components/InstallBanner';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({
  initInstallPromptCapture: vi.fn(() => () => {}),
  canPromptInstall: vi.fn(),
  promptInstall: vi.fn(),
}));

import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';

beforeEach(() => vi.clearAllMocks());

describe('InstallBanner', () => {
  it('已安装时显示"已安装"提示，没有任何操作按钮', () => {
    vi.mocked(isStandalone).mockReturnValue(true);
    render(<InstallBanner />);
    expect(screen.getByText('Already installed to your home screen.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('iOS 未安装时显示手动引导文案，没有可点击的安装按钮', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    render(<InstallBanner />);
    expect(screen.getByText(/Add to Home Screen/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('Android 未安装且浏览器支持 beforeinstallprompt 时显示安装按钮，点击触发 promptInstall', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(true);
    render(<InstallBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(promptInstall).toHaveBeenCalled();
  });
});
