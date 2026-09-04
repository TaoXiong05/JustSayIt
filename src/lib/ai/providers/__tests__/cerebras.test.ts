import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createMock = vi.fn();

vi.mock('@cerebras/cerebras_cloud_sdk', () => ({
  // 必须是可 new 的构造函数（箭头函数不行——`new (() => {})()` 会抛
  // "is not a constructor"），普通 function 显式 return 对象时，
  // new 出来的就是这个对象。
  default: vi.fn().mockImplementation(function CerebrasMock() {
    return { chat: { completions: { create: createMock } } };
  }),
}));

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

function mockReply(records: unknown[]) {
  return {
    choices: [{ message: { content: JSON.stringify({ records }) } }],
  };
}

beforeEach(() => {
  process.env.CEREBRAS_API_KEY = 'test-key';
  createMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cerebrasStructure', () => {
  it('解析出账目记录', async () => {
    createMock.mockResolvedValue(
      mockReply([
        {
          type: 'EXPENSE',
          amount: 54.3,
          currency: null,
          date: '2026-09-04',
          category: 'FOOD',
          merchant: 'Woolworths',
          description: '买菜',
        },
      ]),
    );
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    const out = await cerebrasStructure('Woolworths 买菜五十四块三', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(54.3);
  });

  it('请求体带上 strict schema 与固定参数（含关闭推理）', async () => {
    createMock.mockResolvedValue(mockReply([]));
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    await cerebrasStructure('今天天气不错', ctx);

    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('qwen-3.8-27b');
    expect(call.temperature).toBe(0);
    expect(call.reasoning_effort).toBe('none');
    expect(call.response_format.json_schema.strict).toBe(true);

    const item = call.response_format.json_schema.schema.properties.records.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(
      expect.arrayContaining(['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description']),
    );
    expect(item.properties.currency.type).toEqual(['string', 'null']);
    expect(item.properties.merchant.type).toEqual(['string', 'null']);
  });

  it('空输入返回空数组', async () => {
    createMock.mockResolvedValue(mockReply([]));
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    expect(await cerebrasStructure('今天天气不错', ctx)).toEqual([]);
  });

  it('模型返回不合契约时抛错（运行时校验是最后防线）', async () => {
    createMock.mockResolvedValue(
      mockReply([
        {
          type: 'EXPENSE',
          amount: -5, // 负数违反规则二
          currency: null,
          date: '2026-09-04',
          category: 'FOOD',
          merchant: null,
          description: 'x',
        },
      ]),
    );
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    await expect(cerebrasStructure('x', ctx)).rejects.toThrow(/校验/);
  });

  it('契约校验失败时的错误信息不包含用户输入或响应中的自由文本（隐私红线）', async () => {
    const sentinelInput = 'ZZZ_SENTINEL_INPUT_8f3a1c2e';
    const sentinelMerchant = 'ZZZ_SENTINEL_MERCHANT_9d4b2f1a';
    const sentinelDescription = 'ZZZ_SENTINEL_DESC_7c1e5a3d';
    createMock.mockResolvedValue(
      mockReply([
        {
          type: 'EXPENSE',
          amount: -5,
          currency: null,
          date: '2026-09-04',
          category: 'FOOD',
          merchant: sentinelMerchant,
          description: sentinelDescription,
        },
      ]),
    );
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    const err = await cerebrasStructure(sentinelInput, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/校验/);
    expect(message).not.toContain(sentinelInput);
    expect(message).not.toContain(sentinelMerchant);
    expect(message).not.toContain(sentinelDescription);
  });

  it('SDK 抛错时只带状态码，不泄漏请求内容', async () => {
    createMock.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    await expect(cerebrasStructure('买菜54块3', ctx)).rejects.toThrow(/429/);
    await expect(cerebrasStructure('买菜54块3', ctx)).rejects.not.toThrow(/买菜/);
  });

  it('缺少 CEREBRAS_API_KEY 时抛错', async () => {
    const original = process.env.CEREBRAS_API_KEY;
    delete process.env.CEREBRAS_API_KEY;
    try {
      const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
      await expect(cerebrasStructure('随便什么', ctx)).rejects.toThrow(/CEREBRAS_API_KEY/);
    } finally {
      if (original === undefined) {
        delete process.env.CEREBRAS_API_KEY;
      } else {
        process.env.CEREBRAS_API_KEY = original;
      }
    }
  });

  it('响应缺少 message.content 字段时抛错', async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }] });
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    await expect(cerebrasStructure('随便什么', ctx)).rejects.toThrow(/缺少 content/);
  });

  it('content 不是合法 JSON 时抛错', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    const { cerebrasStructure } = await import('@/lib/ai/providers/cerebras');
    await expect(cerebrasStructure('随便什么', ctx)).rejects.toThrow(/不是合法 JSON/);
  });
});
