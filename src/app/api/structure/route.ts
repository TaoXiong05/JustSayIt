import { z } from 'zod';
import { structure } from '@/lib/ai';

const RequestSchema = z.object({
  text: z.string().trim().min(1),
  localTime: z.string().min(1),
  timeZone: z.string().min(1),
  defaultCurrency: z.string().length(3),
});

function accessAllowed(): boolean {
  // Plan 2 接入认证后移除此开关，改为校验 session
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.ALLOW_UNAUTHENTICATED_API === 'true';
}

export async function POST(request: Request): Promise<Response> {
  if (!accessAllowed()) {
    return Response.json({ error: '未启用' }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ error: '请求参数不合法' }, { status: 400 });
  }

  const { text, ...ctx } = parsed.data;
  const started = Date.now();
  try {
    const records = await structure(text, ctx);
    // 零内容日志（§10.5）：只记元数据，永不记 prompt 与 response 内容
    console.info(
      JSON.stringify({ route: 'structure', ok: true, ms: Date.now() - started, count: records.length }),
    );
    return Response.json({ records });
  } catch (err) {
    console.error(
      JSON.stringify({
        route: 'structure',
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json({ error: '结构化失败，请重试' }, { status: 502 });
  }
}
