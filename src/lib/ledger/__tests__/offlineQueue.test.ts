import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ledger/store', () => ({
  pendingRawInputs: vi.fn(),
  resolveRawInput: vi.fn(),
  // 真实实现是从 IndexedDB 异步读——这里 mock 成"立刻 resolve"，但仍然是
  // 一次真正的 Promise，测试里要等一轮微任务它才落地。
  hydrate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ledger/structureAndSave', () => ({
  structureTextToTransactions: vi.fn(),
}));

import { pendingRawInputs, resolveRawInput } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';
import { retryPendingInputs, initOfflineQueueAutoRetry } from '@/lib/ledger/offlineQueue';

const item = {
  id: 'q1',
  text: '买菜50块',
  localTime: '2026-09-05T10:00:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('retryPendingInputs', () => {
  it('对每条排队输入调用 structureTextToTransactions 并 resolveRawInput', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    vi.mocked(structureTextToTransactions).mockResolvedValue([]);
    await retryPendingInputs();
    expect(structureTextToTransactions).toHaveBeenCalledWith('买菜50块', {
      localTime: item.localTime,
      timeZone: item.timeZone,
      defaultCurrency: item.defaultCurrency,
    });
    expect(resolveRawInput).toHaveBeenCalledWith('q1', []);
  });

  it('某一条补跑失败不影响其它条目继续补跑', async () => {
    const item2 = { ...item, id: 'q2', text: '午餐20块' };
    vi.mocked(pendingRawInputs).mockReturnValue([item, item2]);
    vi.mocked(structureTextToTransactions)
      .mockRejectedValueOnce(new Error('网络还没真的通'))
      .mockResolvedValueOnce([]);
    await retryPendingInputs();
    expect(resolveRawInput).toHaveBeenCalledTimes(1);
    expect(resolveRawInput).toHaveBeenCalledWith('q2', []);
  });

  it('没有排队项时不调用任何补跑逻辑', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([]);
    await retryPendingInputs();
    expect(structureTextToTransactions).not.toHaveBeenCalled();
  });

  it('并发调用时后一次直接跳过，不重复补跑同一批（避免多个 online 事件抖动触发重复请求）', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    let resolveFirst: () => void = () => {};
    vi.mocked(structureTextToTransactions).mockReturnValue(
      new Promise((r) => {
        resolveFirst = () => r([]);
      }),
    );
    const first = retryPendingInputs();
    const second = retryPendingInputs();
    resolveFirst();
    await Promise.all([first, second]);
    expect(structureTextToTransactions).toHaveBeenCalledTimes(1);
  });
});

describe('initOfflineQueueAutoRetry', () => {
  /** 等 initOfflineQueueAutoRetry() 内部那次 hydrate() 落地 */
  const flushHydrate = () => new Promise((r) => setTimeout(r, 0));

  it('注册 online 事件监听，触发时调用补跑', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([]);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const cleanup = initOfflineQueueAutoRetry();
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    cleanup();
  });

  it('启动时先等水合完成再读队列（回归：曾经在 mount 时同步补跑，那一刻 IndexedDB 还没读回来、队列恒为空，于是什么都没补跑；此后只要浏览器一直在线，online 事件就永远不触发，排队项再也等不到任何重试——用户反馈原话："一直 queued，没有重试"）', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    vi.mocked(structureTextToTransactions).mockResolvedValue([]);

    const cleanup = initOfflineQueueAutoRetry();
    // 水合还没落地，此时读到的队列一定是空的，不能在这个时机读
    expect(pendingRawInputs).not.toHaveBeenCalled();

    await flushHydrate();
    expect(structureTextToTransactions).toHaveBeenCalledWith('买菜50块', {
      localTime: item.localTime,
      timeZone: item.timeZone,
      defaultCurrency: item.defaultCurrency,
    });
    expect(resolveRawInput).toHaveBeenCalledWith('q1', []);
    cleanup();
  });

  it('离线时启动不补跑（等 online 事件）', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    const cleanup = initOfflineQueueAutoRetry();
    await flushHydrate();
    expect(structureTextToTransactions).not.toHaveBeenCalled();
    cleanup();
  });

  it('cleanup 早于水合落地时不再补跑（组件已经卸载了）', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([item]);
    const cleanup = initOfflineQueueAutoRetry();
    cleanup();
    await flushHydrate();
    expect(structureTextToTransactions).not.toHaveBeenCalled();
  });
});