import { createEmitter } from '@/lib/emitter';

export type SyncState = {
  /** 已知写入本地、尚未确认同步到 Drive 的 transaction id 集合 */
  unsyncedIds: string[];
  /** 首次进入"有未同步项"状态的时间，用于 B 类分级计时（spec §8.4） */
  firstUnsyncedAt: string | null;
  /** A 类失败标记（spec §8.3）：授权失效/撤销、Drive API 拒绝等，不看时间，立刻提示 */
  authError: boolean;
  lastSyncedAt: string | null;
  /**
   * 最近一次同步尝试的失败原因（成功一次就清空）。
   *
   * 加这个字段的原因（用户反馈原话："后端日志没有报错，网络返回都是 200，
   * 为什么前端一直显示待同步"）：上传是客户端直接打 googleapis.com、不经过
   * 本项目后端，所以后端日志和自家 API 的 200 都证明不了同步成功；而
   * engine.ts 抛出的错误一路被调用方的 `.catch(() => {})` 吞掉，既不写状态
   * 也不打日志——界面上"还没试"和"试了但失败"长得完全一样，无从判断。
   */
  lastError: string | null;
};

/**
 * 空/初始状态——同时是模块自己的初始值，也是组件消费方
 * （SyncStatusDot/SyncWarning/TransactionRow）在 useSyncExternalStore
 * 的服务端快照参数里要用到的同一个值，统一从这里导出，不要各自重复定义。
 */
export const EMPTY_SYNC_STATE: SyncState = {
  unsyncedIds: [],
  firstUnsyncedAt: null,
  authError: false,
  lastSyncedAt: null,
  lastError: null,
};

let state: SyncState = EMPTY_SYNC_STATE;
const { subscribe, emit } = createEmitter();
export { subscribe };

export function getSnapshot(): SyncState {
  return state;
}

export function markUnsynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.add(id);
  state = {
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: state.firstUnsyncedAt ?? new Date().toISOString(),
  };
  emit();
}

export function markSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.delete(id);
  state = {
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: next.size === 0 ? null : state.firstUnsyncedAt,
    authError: false, // 一次成功同步说明授权是好的
    lastSyncedAt: new Date().toISOString(),
  };
  emit();
}

export function markAuthError(): void {
  state = { ...state, authError: true };
  emit();
}

export function clearAuthError(): void {
  state = { ...state, authError: false };
  emit();
}

/** 记下最近一次同步尝试为什么失败（见 SyncState.lastError 的说明）。 */
export function markSyncFailed(message: string): void {
  state = { ...state, lastError: message };
  emit();
}

/** 一次成功的同步尝试之后调用。本来就没有失败记录时不做无意义的通知。 */
export function clearSyncError(): void {
  if (state.lastError === null) return;
  state = { ...state, lastError: null };
  emit();
}

export type BTier = 'ok' | 'lt24h' | '24to72h' | 'gt72h';

/**
 * B 类（网络不可用）的时间分级（spec §8.4）：<24h 不打扰、24–72h 持久横幅、
 * >72h 模态。A 类失败（authError）不受这个分级影响，由调用方单独判断、
 * 立刻提示（spec §8.3："不设时间阈值"）。
 */
export function classifyBTier(state: SyncState, now: Date = new Date()): BTier {
  if (state.unsyncedIds.length === 0 || !state.firstUnsyncedAt) return 'ok';
  const hours = (now.getTime() - new Date(state.firstUnsyncedAt).getTime()) / 3_600_000;
  if (hours < 24) return 'lt24h';
  if (hours < 72) return '24to72h';
  return 'gt72h';
}