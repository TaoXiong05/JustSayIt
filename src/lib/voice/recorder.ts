export type RecorderHandle = { stop(): Promise<Blob>; cancel(): void };

export const DEFAULT_MAX_MS = 60_000; // §9、§10.3a：客户端录音上限 60 秒

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
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof MediaRecorder === 'undefined'
  ) {
    throw new Error('当前浏览器不支持录音');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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