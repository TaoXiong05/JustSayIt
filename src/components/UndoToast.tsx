'use client';

import { useEffect } from 'react';

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
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div role="status">
      <span>{`已记录 ${count} 笔`}</span>
      <button type="button" onClick={onUndo}>
        撤销
      </button>
    </div>
  );
}
