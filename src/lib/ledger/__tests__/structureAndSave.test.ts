import { describe, it, expect, vi, afterEach } from 'vitest';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';

const ctx = {
  localTime: '2026-09-05T10:00:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

afterEach(() => vi.unstubAllGlobals());

describe('structureTextToTransactions', () => {
  it('成功时把 AI 记录转成入库形态的 Transaction（金额转整数分、补默认币种）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          records: [
            {
              type: 'EXPENSE',
              amount: 54.3,
              currency: null,
              date: '2026-09-05',
              category: 'FOOD',
              merchant: 'Woolworths',
              description: '买菜',
            },
          ],
        }),
      }),
    );
    const out = await structureTextToTransactions('Woolworths 买菜54块3', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amountCents).toBe(5430);
    expect(out[0].currency).toBe('AUD');
    expect(out[0].merchant).toBe('Woolworths');
  });

  it('AI 判定无收支信息时返回空数组', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ records: [] }) }),
    );
    expect(await structureTextToTransactions('今天天气不错', ctx)).toEqual([]);
  });

  it('请求失败时抛出 ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }));
    await expect(structureTextToTransactions('买菜', ctx)).rejects.toThrow();
  });

  it('响应形状不合法时抛出（Zod 校验），不返回半成品数据', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: [{ type: 'EXPENSE' }] }), // 缺必填字段
      }),
    );
    await expect(structureTextToTransactions('买菜', ctx)).rejects.toThrow();
  });
});