import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { groqTranscribe } from '@/lib/ai/providers/groq';

beforeEach(() => {
  process.env.GROQ_API_KEY = 'test-key';
});

afterEach(() => {
  vi.restoreAllMocks();
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

    const res = await groqTranscribe(audio, ['Woolworths', 'Uber Eats']);
    expect(res.text).toContain('Woolworths');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('audio/transcriptions');
    expect(init.method).toBe('POST');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    // 不传 language：说话语言可能是中/英/混合，不能用 UI locale 替代（中英文支持 §2、§3）
    expect(form.get('language')).toBeNull();
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

    const res = await groqTranscribe(audio, []);
    expect(res.text).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('连续 429 重试耗尽后抛错', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429 } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

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
    await expect(groqTranscribe(audio, [])).rejects.toThrow(/500/);
  });
});
