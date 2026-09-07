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

  // 回归：手机端口述"65"回填成 "sixty five"。Whisper 的 prompt 是**上文**
  // 不是指令，它模仿上文的数字写法；而 prompt 原来只由 knownMerchants() 组成，
  // 本机没有商户历史（新装/清缓存/访客）时就是空串，Whisper 失去数字写法的
  // 先验，短句会被拼成英文单词——而拼出来的数字不含阿拉伯数字，会被
  // Composer 的 hasAmountSignal 直接拦下，那笔账根本提交不了。
  it('词表为空时 prompt 仍带阿拉伯数字的风格样例', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: '65' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await groqTranscribe(audio, []);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const prompt = String((init.body as FormData).get('prompt'));
    expect(prompt).toMatch(/\d/);
    // 样例里不能出现品牌名：prompt 里的词会被偏置，凭空提高某个商户被听成
    // 的概率是 vocab 的职责，不该由风格样例夹带。
    expect(prompt).not.toMatch(/Woolworths|Coles|Uber/i);
  });

  // 回归：数字样例原来拼在词表**前面**，而 Whisper 超过 224 token 时丢的
  // 是开头——词表越长，样例越先被丢掉，恰好在最该起作用的场景失效。
  it('词表很长时仍保住数字样例，且不从中间切断商户名', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'ok' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    const many = Array.from({ length: 60 }, (_, i) => `MerchantNumber${i}`);
    await groqTranscribe(audio, many);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const prompt = String((init.body as FormData).get('prompt'));
    expect(prompt.length).toBeLessThanOrEqual(224);
    // 样例在最后一段，不会被开头截断吃掉
    expect(prompt.endsWith('65, 12.50, 4.8')).toBe(true);
    // 每一条商户名都是完整的，没有 "MerchantNumb" 这种切一半的残词
    for (const entry of prompt.split(', ').slice(0, -3)) {
      expect(many).toContain(entry);
    }
  });

  // MediaRecorder 的默认输出是平台相关的（桌面 Chrome 给 WebM/Opus，
  // iOS Safari 给 MP4/AAC），扩展名写死 webm 等于把 MP4 谎报成 WebM。
  it('上传文件名的扩展名跟随音频真实容器', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'ok' }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);

    await groqTranscribe(new Blob(['fake-mp4'], { type: 'audio/mp4' }), []);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(((init.body as FormData).get('file') as File).name).toBe('recording.m4a');
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
