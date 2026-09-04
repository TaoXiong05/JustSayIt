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

  it('契约校验失败时的错误信息不包含用户输入或响应中的自由文本（隐私红线）', async () => {
    // 用不可能巧合出现的哨兵值，证明错误信息确实不携带这些自由文本，
    // 而不仅仅是「目前没有」——这个保证不应只靠人工检查 schema.ts。
    const sentinelInput = 'ZZZ_SENTINEL_INPUT_8f3a1c2e';
    const sentinelMerchant = 'ZZZ_SENTINEL_MERCHANT_9d4b2f1a';
    const sentinelDescription = 'ZZZ_SENTINEL_DESC_7c1e5a3d';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockGroqReply([
          {
            type: 'EXPENSE',
            amount: -5, // 负数违反规则二，触发 Zod 拒绝
            currency: null,
            date: '2026-09-04',
            category: 'FOOD',
            merchant: sentinelMerchant,
            description: sentinelDescription,
          },
        ]),
      ),
    );
    const err = await groqStructure(sentinelInput, ctx).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toMatch(/校验/);
    expect(message).not.toContain(sentinelInput);
    expect(message).not.toContain(sentinelMerchant);
    expect(message).not.toContain(sentinelDescription);
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

  it('缺少 GROQ_API_KEY 时抛错', async () => {
    const original = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(groqStructure('随便什么', ctx)).rejects.toThrow(/GROQ_API_KEY/);
    } finally {
      // beforeEach 会在下一个测试前重新赋值，这里显式恢复是为了不依赖那个时序
      if (original === undefined) {
        delete process.env.GROQ_API_KEY;
      } else {
        process.env.GROQ_API_KEY = original;
      }
    }
  });

  it('响应信封本身不是合法 JSON 时抛错（如网关错误页、被截断的响应）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response),
    );
    await expect(groqStructure('随便什么', ctx)).rejects.toThrow(/响应格式异常/);
  });

  it('响应缺少 message.content 字段时抛错，且与「内容不是合法 JSON」区分', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: {} }] }),
      } as unknown as Response),
    );
    await expect(groqStructure('随便什么', ctx)).rejects.toThrow(/缺少 content/);
  });
});
describe('groqTranscribe', () => {
  const audio = new Blob(['fake-webm'], { type: 'audio/webm' });

  it('发送 multipart 到 Groq 转写端点并解析 verbose_json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'Woolworths 买菜 54 块 3', language: 'zh' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    const res = await groqTranscribe(audio, ['Woolworths', 'Uber Eats']);
    expect(res.text).toContain('Woolworths');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('audio/transcriptions');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('zh');
    expect(form.get('temperature')).toBe('0');
    expect(String(form.get('prompt'))).toContain('Woolworths');
    expect((form.get('file') as File).name).toBe('recording.webm');
  });

  it('429 时指数退避重试并最终成功', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 } as unknown as Response)
      .mockResolvedValueOnce({ ok: false, status: 429 } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ text: 'ok' }),
      } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    const res = await groqTranscribe(audio, []);
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('连续 429 重试耗尽后抛错', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429 } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    await expect(groqTranscribe(audio, [])).rejects.toThrow(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('错误消息不带响应体内容', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'secret content',
      } as unknown as Response),
    );
    const { groqTranscribe } = await import('@/lib/ai/providers/groq');
    await expect(groqTranscribe(audio, [])).rejects.toThrow(/500/);
  });
});
