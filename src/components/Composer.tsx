'use client';

import { useState } from 'react';
import { VoiceButton } from '@/components/VoiceButton';

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STT 结果回填：追加到现有输入末尾（已有文本则在尾部补空格分隔）。
  // 不自动提交——复用「用户在输入框确认 → 提交」的既有流程（spec §9 关键决定）。
  const appendText = (t: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
  };

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const submittedText = text.trim();
    // 提交瞬间就清空，而非等成功后才清空：乐观插入的占位行已经是用户的
    // "回执"，没有理由继续占着输入框——占着的话，用户趁在途时继续输入的
    // 下一句会在这次提交成功时被 setText('') 误清掉（因为那时清的是此刻
    // 框里的内容，不一定是本次提交的内容）。
    setText('');
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(submittedText);
    } catch {
      setText(submittedText); // 失败时把本次提交的原文还回去，供重试/编辑
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
      <VoiceButton onTranscribed={appendText} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
