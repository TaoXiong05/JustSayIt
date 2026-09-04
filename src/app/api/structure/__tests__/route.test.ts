import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai', () => ({ structure: vi.fn() }));
vi.mock('@/lib/server/guard', () => ({ authenticate: vi.fn() }));
vi.mock('@/lib/server/quota', () => ({ quotaService: { consume: vi.fn() } }));
vi.mock('@/lib/server/user', () => ({
  userRepo: { findOrCreateUser: vi.fn() },
}));

import { POST } from '@/app/api/structure/route';
import { structure } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

const body = {
  text: '早餐麦当劳25',
  localTime: '2026-09-04T19:30:00+10:00',
  timeZone: 'Australia/Sydney',
  defaultCurrency: 'AUD',
};
const req = (b: unknown) =>
  new Request('http://localhost/api/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b),
  });

const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.mocked(authenticate).mockResolvedValue(USER);
  vi.mocked(userRepo.findOrCreateUser).mockResolvedValue({ id: 'u1', ...USER });
  vi.mocked(quotaService.consume).mockResolvedValue({ ok: true, remaining: 59 });
  vi.mocked(structure).mockReset();
});
afterEach(() => vi.clearAllMocks());

describe('POST /api/structure 已认证', () => {
  it('有效 session → 返回抽取结果', async () => {
    vi.mocked(structure).mockResolvedValue([
      {
        type: 'EXPENSE',
        amount: 25,
        currency: null,
        date: '2026-09-04',
        category: 'FOOD',
        merchant: '麦当劳',
        description: '早餐',
      },
    ]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect((await res.json()).records).toHaveLength(1);
    expect(quotaService.consume).toHaveBeenCalledTimes(1);
    expect(vi.mocked(quotaService.consume).mock.calls[0][0]).toBe('u1');
  });

  it('未登录 → 401 且不调 AI', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      error: { status: 401, body: { error: '未登录' } },
    });
    const res = await POST(req(body));
    expect(res.status).toBe(401);
    expect(structure).not.toHaveBeenCalled();
  });

  it('超配额 → 429 且不调 AI，带 QUOTA_EXCEEDED code（供客户端本地化文案，中英文支持 §8）', async () => {
    vi.mocked(quotaService.consume).mockResolvedValue({
      ok: false,
      message: '今日已达上限',
    });
    const res = await POST(req(body));
    expect(res.status).toBe(429);
    expect(structure).not.toHaveBeenCalled();
    expect((await res.json()).code).toBe('QUOTA_EXCEEDED');
  });

  it('请求体不是合法 JSON → 400，带 INVALID_REQUEST code', async () => {
    const bad = new Request('http://localhost/api/structure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(bad);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_REQUEST');
  });

  it('text 为空/超长仍返回 400', async () => {
    expect((await POST(req({ ...body, text: '  ' }))).status).toBe(400);
    expect((await POST(req({ ...body, text: 'x'.repeat(2001) }))).status).toBe(400);
  });

  it('上游失败返回 502 且响应不含用户输入，带 UPSTREAM_FAILED code', async () => {
    vi.mocked(structure).mockRejectedValue(new Error('Groq 请求失败：HTTP 429'));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain('早餐麦当劳');
    expect(json.code).toBe('UPSTREAM_FAILED');
  });

  it('bypass 逃生舱放行（不再查配额）', async () => {
    vi.mocked(authenticate).mockResolvedValue({ bypass: true } as never);
    vi.mocked(structure).mockResolvedValue([]);
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(quotaService.consume).not.toHaveBeenCalled();
  });
});