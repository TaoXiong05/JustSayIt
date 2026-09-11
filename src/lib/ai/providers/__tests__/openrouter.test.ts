import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openrouterStructure } from '@/lib/ai/providers/openrouter';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

function mockReply(records: unknown[], finishReason = 'stop') {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ records }) }, finish_reason: finishReason }],
    }),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('openrouterStructure', () => {
  it('解析出账目记录', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      ),
    );
    const out = await openrouterStructure('Woolworths 买菜五十四块三', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(54.3);
  });

  it('请求体带上限定的供应商路由、strict schema 与固定参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockReply([]));
    vi.stubGlobal('fetch', fetchMock);
    await openrouterStructure('今天天气不错', ctx);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe('none');
    // CoreWeave 排第一（实测延迟最低最稳），Reka 排最后（确定性弱于另外两家）
    expect(body.provider).toEqual({
      order: ['coreweave', 'parasail', 'reka'],
      allow_fallbacks: false,
      data_collection: 'deny',
    });
    expect(body.response_format.json_schema.strict).toBe(true);

    const item = body.response_format.json_schema.schema.properties.records.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(
      expect.arrayContaining(['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description']),
    );
  });

  it('空输入返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockReply([])));
    expect(await openrouterStructure('今天天气不错', ctx)).toEqual([]);
  });

  it('模型返回不合契约时抛错（运行时校验是最后防线）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
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
      ),
    );
    await expect(openrouterStructure('x', ctx)).rejects.toThrow(/校验/);
  });

  it('输出被长度上限截断时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockReply([], 'length')));
    await expect(openrouterStructure('x', ctx)).rejects.toThrow(/截断/);
  });

  it('429 时指数退避重试并最终成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 429 } as unknown as Response)
      .mockResolvedValueOnce(mockReply([]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await openrouterStructure('x', ctx)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('连续 429 重试耗尽后抛错，且不泄漏响应体', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'secret content',
      } as unknown as Response),
    );
    await expect(openrouterStructure('x', ctx)).rejects.toThrow(/429/);
    await expect(openrouterStructure('x', ctx)).rejects.not.toThrow(/secret content/);
  });

  it('缺少 OPENROUTER_API_KEY 时抛错', async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(openrouterStructure('随便什么', ctx)).rejects.toThrow(/OPENROUTER_API_KEY/);
    } finally {
      if (original === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = original;
      }
    }
  });

  it('响应缺少 content 字段时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
      } as unknown as Response),
    );
    await expect(openrouterStructure('随便什么', ctx)).rejects.toThrow(/缺少 content/);
  });

  it('content 不是合法 JSON 时抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'not json' } }] }),
      } as unknown as Response),
    );
    await expect(openrouterStructure('随便什么', ctx)).rejects.toThrow(/不是合法 JSON/);
  });
});
