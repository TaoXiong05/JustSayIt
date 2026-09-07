import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { render } from '@/test/renderWithLocale';
import { LocaleProvider } from '@/lib/i18n/context';
import { InstallNavButton } from '@/components/InstallNavButton';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({
  canPromptInstall: vi.fn(),
  promptInstall: vi.fn(),
}));

import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';

beforeEach(() => vi.clearAllMocks());

describe('InstallNavButton（全局页眉里醒目的安装入口）', () => {
  it('已安装到主屏幕时不渲染任何内容', () => {
    vi.mocked(isStandalone).mockReturnValue(true);
    const { container } = render(<InstallNavButton />);
    expect(container.textContent).toBe('');
  });

  it('Android/Chrome 支持 beforeinstallprompt 时渲染按钮，点击触发 promptInstall', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(true);
    render(<InstallNavButton />);
    const button = await screen.findByRole('button', { name: 'Install' });
    fireEvent.click(button);
    expect(promptInstall).toHaveBeenCalled();
  });

  it('桌面/非 Chrome 浏览器不支持 beforeinstallprompt 时，降级为指向 /settings 的安装链接，而不是隐藏（回归：Chrome 在用户卸载过同一个 PWA 后进入不回发事件的冷却期，曾导致安装入口在\"卸载过\"之后永久消失——用户反馈原话：\"我之前安装过，然后卸载了就永远看不见了\"）', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    render(<InstallNavButton />);
    const link = await screen.findByRole('link', { name: 'Install' });
    expect(link).toHaveProperty('href', 'http://localhost:3000/settings');
    expect(promptInstall).not.toHaveBeenCalled();
  });

  it('iOS 未安装时渲染链接到设置页（那里有手动安装步骤），不直接调用 promptInstall', async () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    render(<InstallNavButton />);
    const link = await screen.findByRole('link', { name: 'Install' });
    expect(link).toHaveProperty('href', 'http://localhost:3000/settings');
    expect(promptInstall).not.toHaveBeenCalled();
  });

  it('服务端渲染时不会调用 isIOS/isStandalone（回归：直接在渲染体里调用会触发 hydration mismatch，同 InstallBanner.tsx 的根因）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    renderToString(
      <LocaleProvider>
        <InstallNavButton />
      </LocaleProvider>,
    );
    expect(isIOS).not.toHaveBeenCalled();
    expect(isStandalone).not.toHaveBeenCalled();
  });

  it('SSR 首帧就渲染 /settings 安装链接——未登录用户初次访问页面也能看到安装入口（回归：曾经 !mounted 直接 return null，服务端/未登录首次访问完全没有安装按钮）', () => {
    renderToString(
      <LocaleProvider>
        <InstallNavButton />
      </LocaleProvider>,
    );
    // mounted=false 时（SSR 首帧）降级成 /settings 链接，首次访问即有入口
    // 且两边一致（hydration 不 mismatch）。
    expect(isStandalone).not.toHaveBeenCalled(); // mounted=false 短路，没判 standalone
    const html = renderToString(
      <LocaleProvider>
        <InstallNavButton />
      </LocaleProvider>,
    );
    expect(html).toContain('Install');
    expect(html).toContain('href="/settings"');
  });
});
