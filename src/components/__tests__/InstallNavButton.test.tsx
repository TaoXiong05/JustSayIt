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

  it('桌面/非 Chrome 浏览器不支持 beforeinstallprompt 时，依然渲染真正的安装按钮，点击直接调用 promptInstall（回归：2026-09-08 曾降级成指向 /settings 的链接——那条链接在 /settings 页自己点自己会整页刷新，刷新会让一次性的 beforeinstallprompt 事件永久丢失，表现为"点 Install 一直跳转 settings、永远弹不出安装框"；现在不管 installable 与否都渲染同一颗按钮，是否真的弹出原生安装框完全交给 promptInstall 内部的 capturedEvent 判断，导航栏不再自作主张地降级成链接）', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    render(<InstallNavButton />);
    const button = await screen.findByRole('button', { name: 'Install' });
    expect(screen.queryByRole('link', { name: 'Install' })).toBeNull();
    fireEvent.click(button);
    expect(promptInstall).toHaveBeenCalled();
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

  it('SSR 首帧就渲染真正的安装按钮——未登录用户初次访问页面也能看到安装入口（回归：曾经 !mounted 直接 return null，服务端/未登录首次访问完全没有安装按钮；后来又曾改成降级链接，会在 /settings 页自我循环刷新，见上面那条回归用例）', () => {
    renderToString(
      <LocaleProvider>
        <InstallNavButton />
      </LocaleProvider>,
    );
    // mounted=false 时（SSR 首帧）还判不了 iOS/standalone，两边短路一致。
    expect(isStandalone).not.toHaveBeenCalled();
    expect(isIOS).not.toHaveBeenCalled();
    const html = renderToString(
      <LocaleProvider>
        <InstallNavButton />
      </LocaleProvider>,
    );
    expect(html).toContain('Install');
    expect(html).toContain('<button');
    expect(html).not.toContain('href="/settings"');
  });
});
