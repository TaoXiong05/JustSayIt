export type RecorderHandle = { stop(): Promise<Blob>; cancel(): void };

export const DEFAULT_MAX_MS = 60_000; // §9、§10.3a：客户端录音上限 60 秒

/**
 * 携带具体原因的录音失败——UI 层据此选择精确文案，而不是把"这浏览器压根
 * 没有 MediaRecorder""HTTP 明文页面上 navigator.mediaDevices 整个是
 * undefined（浏览器的安全策略，不是真的不支持）""用户点了拒绝"这三种
 * 完全不同的情况都糊成一句"当前浏览器不支持录音"——手机 Chrome 上十有
 * 八九是第二种（局域网 http://192.168.x.x 测试没有 HTTPS），跟"浏览器不
 * 支持"毫无关系，糊成一句话会让人往错误的方向排查。
 */
export class RecorderError extends Error {
  code: 'insecure-context' | 'unsupported' | 'permission-denied' | 'unknown';

  constructor(code: RecorderError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * MediaRecorder 封装（spec §9：WebM/Opus 原生输出直传，不做转码）。
 * - startRecording：请求麦克风并启动录制；maxMs 到顶自动停止（onAutoStop 回调）。
 * - stop()：拼接所有 chunks 为单个 Blob，释放麦克风。
 * - cancel()：丢弃录制并释放麦克风，不产出 Blob。
 */
export async function startRecording(opts?: {
  maxMs?: number;
  onAutoStop?: () => void;
}): Promise<RecorderHandle> {
  const maxMs = opts?.maxMs ?? DEFAULT_MAX_MS;
  if (typeof navigator === 'undefined') {
    throw new RecorderError('unsupported', '当前环境没有 navigator');
  }
  // getUserMedia 只在安全上下文（HTTPS 或 localhost）里存在——非 localhost 的
  // 局域网 http:// 地址上 navigator.mediaDevices 本身就是 undefined，这不是
  // "浏览器不支持录音"，是浏览器故意不把这个 API 暴露给明文页面。判断顺序
  // 很关键：先查 isSecureContext 再查 API 是否存在，否则两种情况都会落进
  // 同一个"不支持"分支，用户以为是设备/浏览器问题，实际上换成 HTTPS 就好了。
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new RecorderError('insecure-context', '非安全上下文，getUserMedia 不可用');
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    throw new RecorderError('unsupported', '当前浏览器不支持录音');
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new RecorderError('permission-denied', '麦克风权限被拒绝');
    }
    throw new RecorderError('unknown', err instanceof Error ? err.message : String(err));
  }
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () =>
    new Promise<Blob>((resolve) => {
      if (stopped) {
        resolve(new Blob(chunks, { type: recorder.mimeType }));
        return;
      }
      stopped = true;
      if (timer) clearTimeout(timer);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = recorder.mimeType || 'audio/webm';
        resolve(new Blob(chunks, { type }));
      };
      if (recorder.state !== 'inactive') recorder.stop();
    });

  const cancel = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (timer) clearTimeout(timer);
  };

  recorder.start();
  timer = setTimeout(() => {
    opts?.onAutoStop?.();
    void stop();
  }, maxMs);

  return { stop, cancel };
}

export type VoiceRecorder = { start(): Promise<RecorderHandle> };

/** 惰性工厂：真正启动前不触碰 getUserMedia，便于组件测试注入。 */
export function initializeRecorder(): VoiceRecorder {
  return { start: () => startRecording() };
}