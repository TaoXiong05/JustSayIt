'use client';

import { useState } from 'react';
import { VoiceButton } from '@/components/VoiceButton';
import { useLocale } from '@/lib/i18n/context';
import { ApiError } from '@/lib/apiError';
import { errorCodeToKey } from '@/lib/i18n/dictionary';
import { hasAmountSignal } from '@/lib/ledger/textValidation';

export function Composer({
  onSubmit,
}: {
  onSubmit: (text: string, viaVoice: boolean) => Promise<void>;
}) {
  const { t } = useLocale();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 语音是不是参与了这次输入——不进 Transaction schema（那是持久化数据，
  // "这笔账是怎么输入的"不是记账事实的一部分），只是一个提交前的瞬时
  // UI 状态，用来给乐观插入的占位行加一个"刚刚是说出来的"标记（见
  // page.tsx 的 pending 列表 + PendingRow）。voicePulseSeq 单独驱动输入框
  // 的一次性涟漪动效——每次语音回填都要重新播放一次，用递增的 key 强制
  // 重新挂载动画元素，比用 state 开关 + onAnimationEnd 复位更简单可靠
  // （连续多次说话回填也能各自触发一次，不会因为上一次动画还没播完而被吞）。
  const [viaVoice, setViaVoice] = useState(false);
  const [voicePulseSeq, setVoicePulseSeq] = useState(0);

  // STT 结果回填：追加到现有输入末尾（已有文本则在尾部补空格分隔）。
  // 不自动提交——复用「用户在输入框确认 → 提交」的既有流程（spec §9 关键决定）。
  const appendText = (t: string) => {
    setText((prev) => (prev.trim() ? `${prev.trim()} ${t}` : t));
    setViaVoice(true);
    setVoicePulseSeq((s) => s + 1);
  };

  const canSubmit = text.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    const submittedText = text.trim();
    // 前端最基础的校验（省一次注定失败的 AI 请求，见 textValidation.ts）：
    // 没有任何数字信号时直接在本地拦下，不清空输入框、不发请求——用户
    // 反馈原话："同样的文字输入能不能在前端先做一个基础的校验"。
    if (!hasAmountSignal(submittedText)) {
      setError(t('errorMissingAmount'));
      return;
    }
    const submittedViaVoice = viaVoice;
    // 提交瞬间就清空，而非等成功后才清空：乐观插入的占位行已经是用户的
    // "回执"，没有理由继续占着输入框——占着的话，用户趁在途时继续输入的
    // 下一句会在这次提交成功时被 setText('') 误清掉（因为那时清的是此刻
    // 框里的内容，不一定是本次提交的内容）。
    setText('');
    setViaVoice(false);
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(submittedText, submittedViaVoice);
    } catch (err) {
      setText(submittedText); // 失败时把本次提交的原文还回去，供重试/编辑
      setViaVoice(submittedViaVoice); // 连同"是不是语音输入"这个状态一起还原
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
    // shadow-pop（而不是列表/数据类卡片统一用的 shadow-card）：这是页面上
    // 唯一的主操作入口，材质上应该比历史记录、统计面板这些"数据展示"卡片
    // 更"实体化"一点，建立当前扁平卡片系统里缺失的层级（改善方向 #6）。
    // flex h-full flex-col：输入区现在是页面底部的定高区块（移动端约半屏，
    // 见 ledger/page.tsx），标题/输入胶囊保持自身高度（shrink-0），中间的
    // VoiceButton 用 flex-1 + justify-center 吃掉多出来的高度——按钮因此
    // 自然落在卡片竖直方向的中段，而卡片本身贴着屏幕底部（紧邻底部 tab
    // 栏），这正好是单手持机时拇指最容易够到的区域，不需要额外的绝对定位。
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-pop">
      <div className="shrink-0 text-center">
        <h2 className="font-display text-lg font-bold text-ink">{t('composerTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('composerSubtitle')}</p>
      </div>
      {/* min-h-0 让这个 flex-1 区域能真的收缩到比内容矮（flex item 默认
          min-height:auto 会顶住内容撑开父容器）；overflow-y-auto 是安全网——
          万一某台设备上录音态内容（大圆+声波+文案）还是比这块可用空间高，
          让它自己内部滚动，而不是把标题/输入胶囊挤出卡片本身的高度
          （回归：录音态一度比空闲态明显更高，在 42dvh 的卡片里挤变形了，
          见 VoiceButton.tsx 两态尺寸的调整）。 */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
        <VoiceButton onTranscribed={appendText} />
      </div>
      {/* 输入框+按钮：容器从胶囊（rounded-full）改成圆角矩形（rounded-2xl）——
          input 换成了会自动换行的 textarea（用户反馈：账目描述有时一行装不
          下，希望能在框内换行看到完整内容），多行撑高后胶囊形状会变形，
          矩形更合适。回车键仍然直接提交（preventDefault 拦掉默认换行），
          没有引入"回车换行、按钮才提交"的新操作习惯。移动端整体比桌面端
          大一圈（py/text/px），跟 VoiceButton 的放大同一个理由——半屏高度
          的卡片需要同比放大的内容去填满，lg: 断点还原回桌面端原尺寸。 */}
      <div className="relative flex shrink-0 items-end gap-2 rounded-2xl border border-border bg-surface py-2.5 pl-5 pr-2 focus-within:border-brand lg:py-1.5 lg:pl-4 lg:pr-1.5">
        {/* 语音回填的一次性涟漪提示（改善方向 #3）：key 用递增序号强制
            重新挂载，保证连续多次语音回填都能各自完整播完一遍动画。 */}
        {voicePulseSeq > 0 && (
          <span
            key={voicePulseSeq}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl [animation:voice-pulse-once_0.6s_ease-out_forwards]"
          />
        )}
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 回车直接提交、不换行——保持跟原单行 input 一致的操作习惯，
            // "自动换行"只是文本超出宽度时的视觉效果，不是"回车能手动换行"。
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={t('composerPlaceholder')}
          className="min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base text-ink placeholder:text-muted focus:outline-none lg:text-sm"
        />
        {/* Submit 按钮缩小一档（用户反馈：太大了），self-end 贴着输入框底部对齐，
            不随文本行数增多而跟着垂直居中漂移。 */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mb-1.5 shrink-0 self-end rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:px-3 lg:py-1 lg:text-xs"
        >
          {submitting ? t('submitting') : t('submit')}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 shrink-0 text-center text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
