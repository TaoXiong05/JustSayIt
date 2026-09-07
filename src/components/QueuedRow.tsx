import { useLocale } from '@/lib/i18n/context';

export function QueuedRow({ text }: { text: string }) {
  const { t } = useLocale();
  return (
    <li
      aria-live="polite"
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
    >
      <span className="truncate text-sm text-ink">{text}</span>
      <span className="shrink-0 text-xs font-medium text-warning">{t('queuedOffline')}</span>
    </li>
  );
}