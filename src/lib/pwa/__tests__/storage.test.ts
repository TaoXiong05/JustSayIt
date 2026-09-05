import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage, getStorageEstimate } from '@/lib/pwa/storage';

afterEach(() => vi.unstubAllGlobals());

describe('requestPersistentStorage', () => {
  it('调用 navigator.storage.persist() 并返回结果', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalled();
  });

  it('浏览器不支持 storage.persist 时返回 false，不报错', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('getStorageEstimate', () => {
  it('返回已用/配额字节数', async () => {
    const estimate = vi.fn().mockResolvedValue({ usage: 1024, quota: 1024 * 1024 });
    vi.stubGlobal('navigator', { storage: { estimate } });
    expect(await getStorageEstimate()).toEqual({ usageBytes: 1024, quotaBytes: 1024 * 1024 });
  });

  it('浏览器不支持时返回 null', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getStorageEstimate()).toBeNull();
  });
});
