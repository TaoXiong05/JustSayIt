import { useLocale } from '@/lib/i18n/context';

export function QueuedRow({ text }: { text: string }) {
  const { t } = useLocale();
  return (
    <li aria-live="polite">
      <span>{text}</span>
      <span>{t('queuedOffline')}</span>
    </li>
  );
}