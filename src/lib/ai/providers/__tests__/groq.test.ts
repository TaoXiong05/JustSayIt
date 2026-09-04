import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groqStructure } from '@/lib/ai/providers/groq';

const ctx = {
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};

function mockGroqReply(records: unknown[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({ records }) } }],
      usage: { prompt_tokens: 497, completion_tokens: 63 },
    }),
  } as unknown as Response;
}

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('groqStructure', () => {
  it('解析出账目记录', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockGroqReply([
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
    const out = await groqStructure('Woolworths 买菜五十四块三', ctx);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(54.3);
  });

  it('请求体带上 strict schema 与固定参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockGroqReply([]));
    vi.stubGlobal('fetch', fetchMock);
    await groqStructure('今天天气不错', ctx);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.temperature).toBe(0);
    expect(body.reasoning_effort).toBe('none');
    expect(body.response_format.json_schema.strict).toBe(true);

    // Groq strict 模式要求（§10.2b）
    const item = body.response_format.json_schema.schema.properties.records.items;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(
      expect.arrayContaining(['type', 'amount', 'currency', 'date', 'category', 'merchant', 'description']),
    );
    expect(item.properties.currency.type).toEqual(['string', 'null']);
    expect(item.properties.merchant.type).toEqual(['string', 'null']);
  });

  it('空输入返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockGroqReply([])));
    expect(await groqStructure('今天天气不错', ctx)).toEqual([]);
  });

  it('模型返回不合契约时抛错（运行时校验是最后防线）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockGroqReply([
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
    await expect(groqStructure('x', ctx)).rejects.toThrow(/校验/);
  });

  it('HTTP 错误时抛出且不泄漏请求内容', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
      } as unknown as Response),
    );
    await expect(groqStructure('买菜54块3', ctx)).rejects.toThrow(/429/);
    await expect(groqStructure('买菜54块3', ctx)).rejects.not.toThrow(/买菜/);
  });
});
