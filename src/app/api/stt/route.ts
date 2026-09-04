import { transcribe } from '@/lib/ai';
import { authenticate } from '@/lib/server/guard';
import { quotaService } from '@/lib/server/quota';
import { userRepo } from '@/lib/server/user';

export const runtime = 'nodejs';

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq 免费层单文件上限（§10.3a）

/**
 * POST /api/stt —— Audio → Text（spec §9、§16.6）。
 * body = MediaRecorder 原生输出（WebM/Opus 直传，不做转码）。
 * query ?vocab=<JSON.stringify(string[])> = 商户词表偏置（knownMerchants）。
 * 认证与配额在服务端强制；音量/转写与 Plan 1 的 structure 共享同一配额。
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if ('error' in auth) {
    return Response.json(auth.error.body, { status: auth.error.status });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/')) {
    return Response.json(
      { error: '仅接受音频（audio/*）', code: 'INVALID_REQUEST' },
      { status: 400 },
    );
  }

  const blob = await request.blob();
  if (blob.size === 0) {
    return Response.json({ error: '音频为空', code: 'INVALID_REQUEST' }, { status: 400 });
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: '音频过大', code: 'INVALID_REQUEST' }, { status: 400 });
  }

  // 词表偏置（§16.3）：来自前端 knownMerchants()
  let vocab: string[] = [];
  const raw = new URL(request.url).searchParams.get('vocab');
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        vocab = parsed.filter((x): x is string => typeof x === 'string');
      }
    } catch {
      // 非法 vocab 忽略，不拒绝请求——偏置是可选的增强
    }
  }

  // server-side 配额：与 structure 同池（§10.3a）
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

  const started = Date.now();
  try {
    const { text } = await transcribe(blob, vocab);
    // 零内容日志（§10.5）
    console.info(
      JSON.stringify({
        route: 'stt',
        ok: true,
        ms: Date.now() - started,
        chars: text.length,
      }),
    );
    return Response.json({ text });
  } catch (err) {
    console.error(
      JSON.stringify({
        route: 'stt',
        ok: false,
        ms: Date.now() - started,
        error: err instanceof Error ? err.message : 'unknown',
      }),
    );
    return Response.json(
      { error: '转写失败，请重试', code: 'UPSTREAM_FAILED' },
      { status: 502 },
    );
  }
}