'use client';

import { useState } from 'react';

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      setText(''); // 仅在成功后清空——失败时保留内容供重试
    } catch {
      setError('记账失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="说点什么…"
        rows={2}
      />
      <button type="button" onClick={handleSubmit} disabled={!canSubmit}>
        {submitting ? '提交中…' : '提交'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
