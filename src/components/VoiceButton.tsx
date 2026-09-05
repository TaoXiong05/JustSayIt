'use client';

import { Mic } from 'lucide-react';
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

  if (status === 'recording') {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <button
          type="button"
          onClick={() => void stop()}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('voiceStop')}
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2"
        >
          {t('voiceCancel')}
        </button>
        <span aria-live="polite" className="animate-pulse font-medium text-danger">
          {t('voiceRecording')}
        </span>
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        onClick={() => void start()}
        disabled={status === 'transcribing'}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === 'transcribing' ? (
          t('voiceTranscribing')
        ) : (
          <>
            {/* 原 emoji（🎤）拆成纯文本字典 + 独立 Mic 图标（Global Constraint 9）——
                字典字符串承载不了 React 组件。 */}
            <Mic aria-hidden="true" className="size-4" />
            {t('voiceStart')}
          </>
        )}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-sm font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}