/**
 * 最小的订阅/广播原语——sync/status.ts、ledger/store.ts、toast.ts、
 * auth/client.ts 都是同一个 useSyncExternalStore 契约（subscribe + emit），
 * 之前各自手写一份 listeners:Set + 遍历调用，这里抽成共享实现。
 */
export function createEmitter() {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    emit(): void {
      for (const fn of listeners) fn();
    },
  };
}
