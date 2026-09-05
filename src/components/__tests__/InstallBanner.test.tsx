import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { render } from '@/test/renderWithLocale';
import { LocaleProvider } from '@/lib/i18n/context';
import { InstallBanner } from '@/components/InstallBanner';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({
  initInstallPromptCapture: vi.fn(() => () => {}),
  canPromptInstall: vi.fn(),
  promptInstall: vi.fn(),
}));

import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall, initInstallPromptCapture } from '@/lib/pwa/install';

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

  it('自己不再挂 beforeinstallprompt 监听——捕获归应用外壳层负责，挂在这里会错过事件', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    render(<InstallBanner />);
    expect(initInstallPromptCapture).not.toHaveBeenCalled();
  });

  it('服务端渲染（renderToString，effect 永远不跑）不会调用 isIOS/isStandalone —— 回归：曾经在渲染体里直接调用它们，导致 SSR 输出跟真机客户端首次渲染不一致，触发 hydration mismatch', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    renderToString(
      <LocaleProvider>
        <InstallBanner />
      </LocaleProvider>,
    );
    expect(isIOS).not.toHaveBeenCalled();
    expect(isStandalone).not.toHaveBeenCalled();
  });
});
