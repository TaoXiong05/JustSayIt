import { useLocale } from '@/lib/i18n/context';

export function PendingRow({ text }: { text: string }) {
  const { t } = useLocale();
  return (
    <li
      aria-live="polite"
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
    >
      <span className="truncate text-sm text-ink">{text}</span>
      <span className="shrink-0 text-xs text-muted">{t('pendingLabel')}</span>
    </li>
  );
}
