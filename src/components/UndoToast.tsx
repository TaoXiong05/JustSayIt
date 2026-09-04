'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/i18n/context';

const AUTO_DISMISS_MS = 6000;

export function UndoToast({
  count,
  onUndo,
  onDismiss,
}: {
  count: number;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div role="status">
      <span>{t('undoneCount', { count })}</span>
      <button type="button" onClick={onUndo}>
        {t('undo')}
      </button>
    </div>
  );
}
