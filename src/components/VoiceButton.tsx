'use client';

import { useRef, useState } from 'react';
import { transcribe } from '@/lib/ai';
import { knownMerchants } from '@/lib/ledger/store';
import { initializeRecorder } from '@/lib/voice/recorder';
import type { RecorderHandle } from '@/lib/voice/recorder';

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
      setError('当前浏览器不支持录音');
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
      const { text } = await transcribe(audio, vocab);
      onTranscribed(text);
      setStatus('idle');
    } catch {
      setError('转写失败，请重试');
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
          停止
        </button>
        <button type="button" onClick={cancel}>
          取消
        </button>
        <span aria-live="polite">录音中…</span>
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
        {status === 'transcribing' ? '转写中…' : '🎤 录音'}
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}