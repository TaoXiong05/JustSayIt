import { describe, it, expect, afterEach, vi } from 'vitest';
import { isIOS, isStandalone } from '@/lib/platform';

afterEach(() => vi.restoreAllMocks());

describe('isIOS', () => {
  it('iPhone UA 判定为 iOS', () => {
    expect(
      isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit'),
    ).toBe(true);
  });

  it('iPad UA 判定为 iOS', () => {
    expect(
      isIOS('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit'),
    ).toBe(true);
  });

  it('非 iOS（Android/桌面）判定为 false', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit')).toBe(false);
    expect(isIOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
    expect(isIOS('')).toBe(false);
  });

  it('不传 UA 时读取 navigator.userAgent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    expect(isIOS()).toBe(true);
  });
});

describe('isStandalone', () => {
  it('display-mode: standalone 匹配时返回 true', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    expect(isStandalone()).toBe(true);
  });

  it('未匹配时返回 false', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    expect(isStandalone()).toBe(false);
  });
});