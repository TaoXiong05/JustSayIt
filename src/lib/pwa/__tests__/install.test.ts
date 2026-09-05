import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));

import { isIOS, isStandalone } from '@/lib/platform';
import { shouldPrioritizeInstallGuidance } from '@/lib/pwa/install';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initInstallPromptCapture / canPromptInstall / promptInstall', () => {
  // 捕获到的事件存在模块级变量里，且 cleanup 故意不再清空它（见下面那条用例）。
  // 所以每个用例都要拿一份全新的模块实例，否则上一个用例捕获到的事件会漏到
  // 下一个用例里。这里只重置这个 describe 用到的模块，下面 §8.8 那个 describe
  // 仍然用文件顶部静态导入的那份实例（和它的 @/lib/platform mock 保持一致）。
  let install: typeof import('@/lib/pwa/install');

  beforeEach(async () => {
    vi.resetModules();
    install = await import('@/lib/pwa/install');
  });

  it('捕获 beforeinstallprompt 事件后 canPromptInstall 变 true', () => {
    const { initInstallPromptCapture, canPromptInstall } = install;
    const cleanup = initInstallPromptCapture();
    expect(canPromptInstall()).toBe(false);

    const event = new Event('beforeinstallprompt') as Event & { preventDefault: () => void };
    event.preventDefault = vi.fn();
    window.dispatchEvent(event);

    expect(canPromptInstall()).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled(); // 阻止浏览器默认的迷你信息栏
    cleanup();
  });

  it('cleanup 摘掉监听器，但不作废已经捕获到的事件', () => {
    const { initInstallPromptCapture, canPromptInstall } = install;
    const cleanup = initInstallPromptCapture();
    const first = new Event('beforeinstallprompt') as Event & { preventDefault: () => void };
    first.preventDefault = vi.fn();
    window.dispatchEvent(first);
    expect(canPromptInstall()).toBe(true);

    cleanup();

    // 捕获到的 prompt 事件是一次性的稀缺资源：用户从设置页导航走不该把它丢掉，
    // 只有 promptInstall() 真正消费掉之后才作废。
    expect(canPromptInstall()).toBe(true);

    // 监听器确实已经摘掉：cleanup 之后再派发事件不会走进 handler。
    const second = new Event('beforeinstallprompt') as Event & { preventDefault: () => void };
    second.preventDefault = vi.fn();
    window.dispatchEvent(second);
    expect(second.preventDefault).not.toHaveBeenCalled();
  });

  it('promptInstall 在没有捕获到事件时返回 unavailable（iOS 等没有这个 API 的平台）', async () => {
    const { initInstallPromptCapture, promptInstall } = install;
    initInstallPromptCapture();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('promptInstall 调用捕获到的事件的 prompt()，返回用户选择结果', async () => {
    const { initInstallPromptCapture, promptInstall } = install;
    initInstallPromptCapture();
    const event = new Event('beforeinstallprompt') as Event & {
      preventDefault: () => void;
      prompt: () => void;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    event.preventDefault = vi.fn();
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);

    expect(await promptInstall()).toBe('accepted');
    expect(event.prompt).toHaveBeenCalled();
  });
});

describe('shouldPrioritizeInstallGuidance（spec §8.8）', () => {
  it('iOS + 未安装 + 有未同步数据 → 高优先级', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(true);
  });

  it('iOS 但已安装 → 不需要高优先级（已有 ITP 豁免）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(false);
  });

  it('iOS + 未安装但没有未同步数据 → 不需要高优先级', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: false })).toBe(false);
  });

  it('非 iOS → 不适用这条高优先级规则', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    expect(shouldPrioritizeInstallGuidance({ hasUnsyncedData: true })).toBe(false);
  });
});
