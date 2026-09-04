'use client';

import { useRef, useState } from 'react';
import { knownMerchants } from '@/lib/ledger/store';
import { initializeRecorder } from '@/lib/voice/recorder';
import type { RecorderHandle } from '@/lib/voice/recorder';
import { useLocale } from '@/lib/i18n/context';
import { errorCodeToKey } from '@/lib/i18n/dictionary';
import { ApiError, throwApiError } from '@/lib/apiError';

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
    } catch {
      setStatus('unsupported');
      setError(t('voiceUnsupported'));
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
      <span>
        <button type="button" onClick={() => void stop()}>
          {t('voiceStop')}
        </button>
        <button type="button" onClick={cancel}>
          {t('voiceCancel')}
        </button>
        <span aria-live="polite">{t('voiceRecording')}</span>
      </span>
    );
  }

  return (
    <span>
      <button
        type="button"
        onClick={() => void start()}
        disabled={status === 'transcribing'}
      >
        {status === 'transcribing' ? t('voiceTranscribing') : t('voiceStart')}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}