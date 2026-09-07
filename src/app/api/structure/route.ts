import { z } from 'zod';
import { structure } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

const RequestSchema = z.object({
  // .max(2000) 是防御性上限——防止单次请求把任意长正文原样转发给 AI 上游，
  // 不成比例地消耗运营者的配额。
  text: z.string().trim().min(1).max(2000),
  localTime: z.string().min(1),
  timeZone: z.string().min(1),
  defaultCurrency: z.string().length(3),
});

export async function POST(request: Request): Promise<Response> {
  // 认证由 server-side guard 强制（Plan 2）：无有效 session → 401。
  // ALLOW_UNAUTHENTICATED_API=true 是显式逃生舱（本地无 OAuth 凭据时开发用）。
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: '请求体不是合法 JSON', code: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }

  const parsed = RequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: '请求参数不合法', code: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }

  // server-side 配额：每次 AI 调用（structure 或 stt）从用户配额扣一次（§10.3a）
  if (!('bypass' in auth)) {
    const profile = await userRepo.findOrCreateUser({
      googleSub: auth.googleSub,
      email: auth.email,
      name: auth.name,
      picture: auth.picture,
    });
    const q = await quotaService.consume(profile.id);
    if (!q.ok) {
      return Response.json({ error: q.message, code: 'QUOTA_EXCEEDED' }, { status: 429 });
    }
  }

  const { text, ...ctx } = parsed.data;
  const started = Date.now();
  try {
    const records = await structure(text, ctx);
    // 记账成功 = 本设备对账本有真实写入。bump 同步哨兵，让用户其它设备
    // 前端轮询 /api/sync-version 时发现版本变大、去同步 Drive 拉取这笔新账。
    // bump 失败不阻塞记账响应：本地账目已经落地、会随本设备下一次 syncNow
    // 上传，哨兵只是触发对端"尽快拉取"，丢一次下次轮询/记账仍会补上。
    if (!('bypass' in auth)) {
      try {
        await userRepo.bumpSyncVersion(auth.googleSub);
      } catch (err) {
        console.error(
          JSON.stringify({
            route: 'structure',
            ok: true,
            bumpSyncVersion: false,
            error: err instanceof Error ? err.message : 'unknown',
          }),
        );
      }
    }
    // 零内容日志（§10.5）：只记元数据，永不记 prompt 与 response 内容
    console.info(
      JSON.stringify({
        route: 'structure',
        ok: true,
        ms: Date.now() - started,
        count: records.length,
      }),
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
    return Response.json(
      { error: '结构化失败，请重试', code: 'UPSTREAM_FAILED' },
      { status: 502 },
    );
  }
}
