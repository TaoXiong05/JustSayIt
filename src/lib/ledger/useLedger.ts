'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  subscribe,
  getSnapshot,
  hydrate,
  getEventsSnapshot,
  pendingRawInputsFrom,
} from '@/lib/ledger/store';
import type { Ledger } from '@/lib/ledger/replay';
import type { RawInputQueuedPayload } from '@/lib/ledger/events';

const EMPTY: Ledger = { transactions: [] };

export function useLedger(): Ledger {
  useEffect(() => {
    void hydrate();
  }, []);
  // 服务端渲染时返回稳定的空账本，避免 hydration 不匹配
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/**
 * 离线队列里仍未结构化的输入。派生（筛选）在这里用 useMemo 做，
 * 不在 store 的 getSnapshot 里做——否则每次调用返回新数组，
 * React 判定状态持续变化，无限重渲染（spec §6.6 的既定规则）。
 */
export function usePendingRawInputs(): RawInputQueuedPayload[] {
  const events = useSyncExternalStore(subscribe, getEventsSnapshot, () => []);
  return useMemo(() => pendingRawInputsFrom(events), [events]);
}
