import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/quota', () => ({ quotaService: { consume: vi.fn() } }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { findOrCreateUser: vi.fn() },
}));
vi.mock('@/lib/ai', () => ({ transcribe: vi.fn() }));

import { POST } from '@/app/api/stt/route';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';
import { transcribe } from '@/lib/ai';

const USER = { googleSub: 's1', email: null, name: null, picture: null };

const audioReq = (opts?: {
  size?: number;
  contentType?: string;
  vocab?: string[];
}) => {
  const size = opts?.size ?? 1024;
  const body = new Uint8Array(size);
  const params = new URLSearchParams({
    vocab: JSON.stringify(opts?.vocab ?? []),
  });
  return new Request(`http://localhost/api/stt?${params.toString()}`, {
    method: 'POST',
    headers: { 'content-type': opts?.contentType ?? 'audio/webm' },
    body,
  });
};

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.findOrCreateUser).mockResolvedValue({ id: 'u1', ...USER });
  vi.mocked(quotaService.consume).mockResolvedValue({ ok: true, remaining: 59 });
  vi.mocked(transcribe).mockResolvedValue({ text: 'Woolworths 买菜' });
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/stt', () => {
  it('转发 audio 与 vocab 给 transcribe 并返回 text', async () => {
    const res = await POST(audioReq({ vocab: ['Woolworths'] }));
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe('Woolworths 买菜');
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transcribe).mock.calls[0][1]).toEqual(['Woolworths']);
  });

  it('未登录 → 401，不调 AI', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录' } },
    });
    const res = await POST(audioReq());
    expect(res.status).toBe(401);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('超配额 → 429，不调 AI', async () => {
    vi.mocked(quotaService.consume).mockResolvedValue({
      ok: false,
      message: '今日已达上限',
    });
    const res = await POST(audioReq());
    expect(res.status).toBe(429);
    expect(transcribe).not.toHaveBeenCalled();
  });

  it('非音频 content-type → 400', async () => {
    const res = await POST(audioReq({ contentType: 'text/plain' }));
    expect(res.status).toBe(400);
  });

  it('音频超过 25MB → 400', async () => {
    const res = await POST(audioReq({ size: 26 * 1024 * 1024 }));
    expect(res.status).toBe(400);
  });

  it('转写失败 → 502 且不泄露内容', async () => {
    vi.mocked(transcribe).mockRejectedValue(new Error('Groq 转写失败：HTTP 500'));
    const res = await POST(audioReq());
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('Woolworths');
  });
});