'use client';

import { useState } from 'react';
import { VoiceButton } from '@/components/VoiceButton';
import { useLocale } from '@/lib/i18n/context';
import { ApiError } from '@/lib/apiError';
import { errorCodeToKey } from '@/lib/i18n/dictionary';

export function Composer({ onSubmit }: { onSubmit: (text: string) => Promise<void> }) {
  const { t } = useLocale();
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
    } catch (err) {
      setText(submittedText); // 失败时把本次提交的原文还回去，供重试/编辑
      const code = err instanceof ApiError ? err.code : undefined;
      setError(t(errorCodeToKey(code, 'errorStructureFailed')));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('composerPlaceholder')}
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
        <VoiceButton onTranscribed={appendText} />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-expense">
          {error}
        </p>
      )}
    </div>
  );
}
