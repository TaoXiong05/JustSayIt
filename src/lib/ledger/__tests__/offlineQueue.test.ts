import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ledger/store', () => ({
  pendingRawInputs: vi.fn(),
  resolveRawInput: vi.fn(),
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
  it('注册 online 事件监听，触发时调用补跑', async () => {
    vi.mocked(pendingRawInputs).mockReturnValue([]);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const cleanup = initOfflineQueueAutoRetry();
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));
    cleanup();
  });
});