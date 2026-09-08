'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, hydrate } from '@/lib/ledger/store';
import type { Ledger } from '@/lib/ledger/replay';

const EMPTY: Ledger = { transactions: [] };

export function useLedger(): Ledger {
  useEffect(() => {
    void hydrate();
  }, []);
  // 服务端渲染时返回稳定的空账本，避免 hydration 不匹配
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
