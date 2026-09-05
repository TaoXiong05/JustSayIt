import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));

import { isIOS, isStandalone } from '@/lib/platform';
import {
  initInstallPromptCapture,
  canPromptInstall,
  promptInstall,
  shouldPrioritizeInstallGuidance,
} from '@/lib/pwa/install';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initInstallPromptCapture / canPromptInstall / promptInstall', () => {
  it('捕获 beforeinstallprompt 事件后 canPromptInstall 变 true', () => {
    const cleanup = initInstallPromptCapture();
    expect(canPromptInstall()).toBe(false);

    const event = new Event('beforeinstallprompt') as Event & { preventDefault: () => void };
    event.preventDefault = vi.fn();
    window.dispatchEvent(event);

    expect(canPromptInstall()).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled(); // 阻止浏览器默认的迷你信息栏
    cleanup();
  });

  it('promptInstall 在没有捕获到事件时返回 unavailable（iOS 等没有这个 API 的平台）', async () => {
    initInstallPromptCapture();
    expect(await promptInstall()).toBe('unavailable');
  });

  it('promptInstall 调用捕获到的事件的 prompt()，返回用户选择结果', async () => {
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
