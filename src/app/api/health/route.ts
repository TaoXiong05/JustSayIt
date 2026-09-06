import { dbHealth } from '@/lib/server/db';

export const runtime = 'nodejs';

/**
 * 部署用的探活接口（Plan 6 Task 1）——Dockerfile 的 HEALTHCHECK 和
 * docker-compose 的 healthcheck 都轮询这个端点。不做鉴权：这是基础设施探针，
 * 不是面向用户的 API，也不泄露任何敏感信息（没有请求体，不含用户数据，
 * 只有一个布尔值）。
 */
export async function GET(): Promise<Response> {
  const ok = await dbHealth();
  return Response.json({ status: ok ? 'ok' : 'error' }, { status: ok ? 200 : 503 });
}
