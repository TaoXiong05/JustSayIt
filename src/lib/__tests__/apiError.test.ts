import { describe, it, expect } from 'vitest';
import { ApiError, throwApiError } from '@/lib/apiError';

describe('throwApiError', () => {
  it('响应体是合法 JSON 且带 code 时，ApiError 携带该 code', async () => {
    const res = new Response(JSON.stringify({ error: '今日已达上限', code: 'QUOTA_EXCEEDED' }), {
      status: 429,
    });
    const err = await throwApiError(res, 'fallback').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('QUOTA_EXCEEDED');
  });

  it('响应体不是合法 JSON（如网关错误页）时，退回 fallback 消息且不带 code', async () => {
    const res = new Response('<html>Bad Gateway</html>', { status: 502 });
    const err = await throwApiError(res, 'fallback message').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe('fallback message');
    expect((err as ApiError).code).toBeUndefined();
  });

  it('响应体是合法 JSON 但没有 code 字段时，同样不带 code', async () => {
    const res = new Response(JSON.stringify({ error: '出错了' }), { status: 500 });
    const err = await throwApiError(res, 'fallback').catch((e: unknown) => e);
    expect((err as ApiError).code).toBeUndefined();
  });
});
