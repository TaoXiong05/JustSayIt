import { Mic } from 'lucide-react';
import { useLocale } from '@/lib/i18n/context';

export function PendingRow({ text, viaVoice = false }: { text: string; viaVoice?: boolean }) {
  const { t } = useLocale();
  return (
    <li
      aria-live="polite"
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
    >
      <span className="flex min-w-0 items-center gap-2">
        {/* "刚刚是说出来的"标记（改善方向 #3）：只在这条占位行还活着的这
            几秒钟里出现——真正落地的 TransactionRow 不携带这个信息，
            因为它不是记账事实，只是这次输入方式的瞬时提示。 */}
        {viaVoice && (
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
          >
            <Mic className="size-3" />
          </span>
        )}
        <span className="truncate text-sm text-ink">{text}</span>
      </span>
      <span className="shrink-0 text-xs text-muted">{t('pendingLabel')}</span>
    </li>
  );
}
