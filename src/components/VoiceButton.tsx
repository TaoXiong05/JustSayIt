'use client';

import { Mic, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { knownMerchants } from '@/lib/ledger/store';
import { initializeRecorder, RecorderError } from '@/lib/voice/recorder';
import type { RecorderHandle } from '@/lib/voice/recorder';
import { useLocale } from '@/lib/i18n/context';
import { errorCodeToKey, type DictKey } from '@/lib/i18n/dictionary';
import { ApiError, throwApiError } from '@/lib/apiError';

/** RecorderError.code → 文案 key。'unknown' 落到通用的 voiceUnsupported。 */
const RECORDER_ERROR_KEY: Record<RecorderError['code'], DictKey> = {
  'insecure-context': 'voiceInsecureContext',
  'permission-denied': 'voicePermissionDenied',
  unsupported: 'voiceUnsupported',
  unknown: 'voiceUnsupported',
};

/**
 * 走 /api/stt 而非直接 import provider（如 groqTranscribe）：
 * 后者读 GROQ_API_KEY，是服务端专属密钥，客户端 bundle 里永远是 undefined，
 * 直接调用只会在浏览器里必现失败，且绕开了服务端的认证与配额（§10.3、§11.5）。
 */
async function transcribeViaApi(audio: Blob, vocab: string[]): Promise<{ text: string }> {
  const qs = new URLSearchParams({ vocab: JSON.stringify(vocab) });
  const res = await fetch(`/api/stt?${qs.toString()}`, {
    method: 'POST',
    headers: { 'content-type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) await throwApiError(res, `STT 请求失败：HTTP ${res.status}`);
  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== 'string') throw new Error('STT 响应缺少 text 字段');
  return { text: data.text };
}

type Status = 'idle' | 'recording' | 'transcribing' | 'unsupported';

/** 每条声波竖线错开起伏的延迟，做出参差感（不是所有条同步跳动）。 */
const WAVE_BAR_DELAYS_MS = [0, 120, 240, 360, 180, 60];

/**
 * 语音输入按钮：录音 → STT → 回填（spec §9）。
 * STT 只负责 Audio → Text；回填后由用户确认，走 Plan 1 既有提交管线。
 * 状态机：idle → recording（可停止/取消）→ transcribing → 回填 / 错误。
 */
export function VoiceButton({
  onTranscribed,
}: {
  onTranscribed: (text: string) => void;
}) {
  const { t } = useLocale();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<RecorderHandle | null>(null);

  async function start() {
    setError(null);
    try {
      const recorder = initializeRecorder();
      recorderRef.current = await recorder.start();
      setStatus('recording');
    } catch (err) {
      setStatus('unsupported');
      const key = err instanceof RecorderError ? RECORDER_ERROR_KEY[err.code] : 'voiceUnsupported';
      setError(t(key));
    }
  }

  async function stop() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setStatus('transcribing');
    try {
      const audio = await rec.stop();
      // 商户词表偏置（§16.3）：历史出现过写法的商户更容易被听对
      const vocab = knownMerchants();
      const { text } = await transcribeViaApi(audio, vocab);
      onTranscribed(text);
      setStatus('idle');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(errorCodeToKey(code, 'errorTranscribeFailed')));
      setStatus('idle');
    }
  }

  function cancel() {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    setStatus('idle');
  }

  // 录音态：图标原地放大 + 声波动画（不是全屏录音层——输入框/Submit 都还在
  // 正常工作，见 Composer.tsx）。取消按钮放在旁边，不清空转写结果直接丢弃。
  if (status === 'recording') {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={cancel}
            aria-label={t('voiceCancel')}
            title={t('voiceCancel')}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void stop()}
            aria-label={t('voiceStop')}
            title={t('voiceStop')}
            className="relative flex size-24 items-center justify-center rounded-full bg-danger text-white shadow-pop"
          >
            {/* ping 波纹圈：跟下面的竖线声波是两种视觉语言的同一个意思——
                "正在录音"，圈负责外围的呼吸感，竖线负责"像声音在跳动"。 */}
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/50" />
            <Mic aria-hidden="true" className="relative size-9" />
          </button>
          {/* 占位元素，抵消左边取消按钮的宽度，让大圆图标视觉居中而不是偏右 */}
          <span className="size-9 shrink-0" aria-hidden="true" />
        </div>
        <div className="flex h-5 items-end gap-1" aria-hidden="true">
          {WAVE_BAR_DELAYS_MS.map((delay, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-danger [animation:voice-wave_0.9s_ease-in-out_infinite]"
              style={{ height: '18px', animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <span aria-live="polite" className="text-xs font-medium text-danger">
          {t('voiceRecording')}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => void start()}
        disabled={status === 'transcribing'}
        aria-label={status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
        title={status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
        className="flex size-16 items-center justify-center rounded-full bg-brand text-brand-ink shadow-pop transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {status === 'transcribing' ? (
          <span
            aria-hidden="true"
            className="size-6 animate-spin rounded-full border-2 border-brand-ink/30 border-t-brand-ink"
          />
        ) : (
          // 原 emoji（🎤）拆成纯文本字典 + 独立 Mic 图标（Global Constraint 9）——
          // 字典字符串承载不了 React 组件。
          <Mic aria-hidden="true" className="size-7" />
        )}
      </button>
      <span className="text-xs font-medium text-muted">
        {status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
      </span>
      {error && (
        <span role="alert" className="max-w-[220px] text-center text-sm font-medium text-danger">
          {error}
        </span>
      )}
    </div>
  );
}