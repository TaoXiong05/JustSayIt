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
    // 整块包进一张卡片，带标题+说明文案——用户提供的参考设计：不再是
    // 裸放在页面上的一组控件，而是一个自成一体的"输入区"卡片。录音按钮
    // 独立在输入框上方，是这块卡片的主视觉；录音中输入框/按钮照常可编辑/
    // 可点，两者互不阻塞（见 VoiceButton 的录音态说明）。
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="text-center">
        <h2 className="font-display text-lg font-bold text-ink">{t('composerTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('composerSubtitle')}</p>
      </div>
      <div className="mt-5 flex justify-center">
        <VoiceButton onTranscribed={appendText} />
      </div>
      {/* 输入框+按钮合成一行胶囊——参考设计的另一个关键点：不再是"输入框
          一行、按钮单独居中一行"两段式。原来的多行 textarea 换成单行
          input：这一行本身就矮，装不下换行内容，且账目描述本来就以
          短句为主。 */}
      <div className="mt-5 flex items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-4 pr-1.5 focus-within:border-brand">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder={t('composerPlaceholder')}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
