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

  it('桌面/Android 浏览器不支持 beforeinstallprompt 时不渲染（没有可用的安装动作）', async () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(canPromptInstall).mockReturnValue(false);
    const { container } = render(<InstallNavButton />);
    await vi.waitFor(() => expect(container.textContent).toBe(''));
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
});
