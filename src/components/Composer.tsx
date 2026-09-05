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
    <div className="flex flex-col gap-3">
      {/* 录音按钮独立在输入框上方，是主屏输入区的主视觉——不再挤在
          Submit 旁边一起当小按钮（这次重做的核心诉求：主屏空间主要
          呈现"记录"这个动作）。录音中输入框/Submit 照常可编辑/可点，
          两者互不阻塞（见 VoiceButton 的录音态说明）。 */}
      <div className="flex justify-center">
        <VoiceButton onTranscribed={appendText} />
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('composerPlaceholder')}
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
      />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-lg bg-brand px-6 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
