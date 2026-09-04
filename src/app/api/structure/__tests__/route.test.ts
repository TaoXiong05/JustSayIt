import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/ai', () => ({ structure: vi.fn() }));

import { POST } from '@/app/api/structure/route';
import { structure } from '@/lib/ai';

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

const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.mocked(structure).mockReset();
});

afterEach(() => {
  vi.stubEnv('NODE_ENV', ORIGINAL_ENV ?? 'test');
  vi.unstubAllEnvs();
});

describe('POST /api/structure', () => {
  it('返回抽取结果', async () => {
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
  });

  it('缺字段返回 400', async () => {
    const res = await POST(req({ text: '早餐25' }));
    expect(res.status).toBe(400);
  });

  it('text 为空字符串返回 400', async () => {
    const res = await POST(req({ ...body, text: '   ' }));
    expect(res.status).toBe(400);
  });

  it('非 development 且未显式放行时返回 403', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_UNAUTHENTICATED_API', 'false');
    const res = await POST(req(body));
    expect(res.status).toBe(403);
    expect(structure).not.toHaveBeenCalled();
  });

  it('上游失败返回 502，且响应体不含用户输入', async () => {
    vi.mocked(structure).mockRejectedValue(new Error('Groq 请求失败：HTTP 429'));
    const res = await POST(req(body));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain('早餐麦当劳');
  });
});
