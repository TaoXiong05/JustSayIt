import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
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
    // 返回 dismissed 让 handleInstall 走完就回来、无状态更新（本用例只关心点击触发调用）
    vi.mocked(promptInstall).mockResolvedValue('dismissed');
    render(<InstallNavButton />);
    const button = await screen.findByRole('button', { name: 'Install' });
    fireEvent.click(button);
    expect(promptInstall).toHaveBeenCalled();
  });

  it('桌面/非 Chrome 浏览器不支持 beforeinstallprompt 时，依然渲染真正的安装按钮，点击直接调用 promptInstall（回归：2026-09-08 曾降级成指向 /settings 的链接——那条链接在 /settings 页自己点自己会整页刷新，刷新会让一次性的 beforeinstallprompt 事件永久丢失，表现为"点 Install 一直跳转 settings、永远弹不出安装框"；现在不管 installable 与否都渲染同一颗按钮，是否真的弹出原生安装框完全交给 promptInstall 内部的 capturedEvent 判断，导航栏不再自作主张地降级成链接）', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    // 返回 dismissed：本用例只关心"不管 installable 与否都渲染同一颗按钮、点击
    // 直接调用 promptInstall"，返回值本身不在此验证范围。
    vi.mocked(promptInstall).mockResolvedValue('dismissed');
    render(<InstallNavButton />);
    const button = await screen.findByRole('button', { name: 'Install' });
    expect(screen.queryByRole('link', { name: 'Install' })).toBeNull();
    fireEvent.click(button);
    expect(promptInstall).toHaveBeenCalled();
  });

  it('点击后 promptInstall 返回 accepted → 冒泡提示"安装已完成"，4 秒后自动消失', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(true);
    vi.mocked(promptInstall).mockResolvedValue('accepted');
    render(<InstallNavButton />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByText('Installed successfully.')).toBeDefined();
  });

  it('点击后 promptInstall 返回 unavailable → 冒泡提示"当前不可用"', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    vi.mocked(promptInstall).mockResolvedValue('unavailable');
    render(<InstallNavButton />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    expect(await screen.findByText("Install isn't available in this browser.")).toBeDefined();
  });

  it('点击后 promptInstall 返回 dismissed（用户在系统安装框里取消）→ 不冒泡打扰', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(promptInstall).mockResolvedValue('dismissed');
    render(<InstallNavButton />);
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    // 等 handleInstall 完整跑完（promptInstall resolve 并走完 dismissed 分支）再断言
    await waitFor(() => expect(promptInstall).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('反馈气泡 4 秒后自动消失', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(true);
    vi.mocked(promptInstall).mockResolvedValue('accepted');
    vi.useFakeTimers();
    try {
      render(<InstallNavButton />);
      // 点击 → promptInstall resolve → setFeedback：全程在 act 里包裹，
      // 让状态更新同步落到 DOM（fake timers 下微任务不会被自动 flush）
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Install' }));
        await Promise.resolve();
      });
      expect(screen.getByText('Installed successfully.')).toBeDefined();
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.queryByText('Installed successfully.')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
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
