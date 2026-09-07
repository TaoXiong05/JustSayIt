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
  /** 是否正在执行一次同步（engine.ts 的 syncNow 开始/结束上报）。UI 据此
      把状态点换成转圈 + \"Syncing…\"。即时状况，不持久化。 */
  syncing: boolean;
  /**
   * 成功完成一次同步标记的单调递增计数器（一次 runSyncOnce 成功 = +1）。
   * 成功反馈的\"去重\"粒度就靠它：engine 一次上传成功一批（比如 5 条账目）
   * 只调用一次 markSyncSucceeded，UI 看到 tick 变化一次、闪一次绿——不会
   * 因为这一批里 5 条各自的 markSynced 而闪 5 次。即时状况，不持久化。
   */
  successTick: number;
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
  syncing: false,
  successTick: 0,
};

const PERSIST_KEY = 'justsayit.sync';

/**
 * 持久化的字段（回归：整个状态原来只活在内存里，刷新一律归零——不管有没有
 * 真的传上去都会显示"已同步"，把同步失败彻底藏起来；24h/72h 的升级预警也
 * 因为计时起点每次刷新重置而实际上永远触发不了）。
 *
 * 只存这三个"事实"，不存 authError / lastError：后两者描述的是最近一次
 * 尝试的即时状况，刷新后 initSync() 立刻会跑一次新的同步重新给出结论，
 * 留着旧值只会在界面上显示一条可能已经不成立的报错。
 *
 * 用 localStorage 而不是账本所在的 IndexedDB：getSnapshot() 要满足
 * useSyncExternalStore 的同步契约（异步存储得先经历一次"空 → 有值"的
 * 落地，等于把刷新后那一瞬间的错误状态又演一遍），而这里的数据量只是
 * 一串 id、也不是真相来源（真相是 IndexedDB 里的事件日志，这里只是
 * "哪些还没传上去"的记账）。
 */
type PersistedSyncState = Pick<SyncState, 'unsyncedIds' | 'firstUnsyncedAt' | 'lastSyncedAt'>;

function loadPersisted(): SyncState {
  // 服务端渲染时没有 localStorage；读坏数据也不能把整个模块带崩——
  // 这份数据是可重建的记账，任何异常都退回空状态，下一次同步会重新算出来。
  try {
    const raw = globalThis.localStorage?.getItem(PERSIST_KEY);
    if (!raw) return EMPTY_SYNC_STATE;
    const parsed = JSON.parse(raw) as Partial<PersistedSyncState>;
    if (!Array.isArray(parsed.unsyncedIds)) return EMPTY_SYNC_STATE;
    return {
      ...EMPTY_SYNC_STATE,
      unsyncedIds: parsed.unsyncedIds.filter((id): id is string => typeof id === 'string'),
      firstUnsyncedAt: typeof parsed.firstUnsyncedAt === 'string' ? parsed.firstUnsyncedAt : null,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    };
  } catch {
    return EMPTY_SYNC_STATE;
  }
}

function persist(next: SyncState): void {
  const toStore: PersistedSyncState = {
    unsyncedIds: next.unsyncedIds,
    firstUnsyncedAt: next.firstUnsyncedAt,
    lastSyncedAt: next.lastSyncedAt,
  };
  try {
    globalThis.localStorage?.setItem(PERSIST_KEY, JSON.stringify(toStore));
  } catch {
    // 隐私模式/配额满等——写不进去就退化回原来的内存行为，不影响本次会话
  }
}

let state: SyncState = loadPersisted();
const { subscribe, emit } = createEmitter();
export { subscribe };

export function getSnapshot(): SyncState {
  return state;
}

/** 所有状态变更的唯一出口：写内存 → 落盘 → 通知订阅者。 */
function commit(next: SyncState): void {
  state = next;
  persist(state);
  emit();
}

export function markUnsynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.add(id);
  commit({
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: state.firstUnsyncedAt ?? new Date().toISOString(),
  });
}

export function markSynced(ids: string[]): void {
  if (ids.length === 0) return;
  const next = new Set(state.unsyncedIds);
  for (const id of ids) next.delete(id);
  commit({
    ...state,
    unsyncedIds: [...next],
    firstUnsyncedAt: next.size === 0 ? null : state.firstUnsyncedAt,
    authError: false, // 一次成功同步说明授权是好的
    lastSyncedAt: new Date().toISOString(),
  });
}

/**
 * 用账本里真实存在的（本设备的）账目 id 校准未同步集合，丢掉对不上的。
 *
 * 未同步集合现在跨刷新存活，就有了它指向的账目在本地已经不存在的可能
 * （清过 IndexedDB、导入了别的设备的数据等）。这类 id 永远等不到
 * markSynced——engine.ts 是从事件日志算"这次上传了哪些 id"的，日志里没有
 * 就永远不会被清掉——留着会让徽标永久停在"待同步"，兜底重试也会每 15 秒
 * 白跑一次。由 initSync() 在水合完成后调用一次（见 sync/init.ts）。
 */
export function reconcileUnsynced(knownTxIds: string[]): void {
  const known = new Set(knownTxIds);
  const kept = state.unsyncedIds.filter((id) => known.has(id));
  if (kept.length === state.unsyncedIds.length) return; // 没有对不上的，不做无意义的通知
  commit({
    ...state,
    unsyncedIds: kept,
    firstUnsyncedAt: kept.length === 0 ? null : state.firstUnsyncedAt,
  });
}

export function markAuthError(): void {
  commit({ ...state, authError: true });
}

export function clearAuthError(): void {
  commit({ ...state, authError: false });
}

/** 记下最近一次同步尝试为什么失败（见 SyncState.lastError 的说明）。 */
export function markSyncFailed(message: string): void {
  commit({ ...state, lastError: message });
}

/** 一次成功的同步尝试之后调用。本来就没有失败记录时不做无意义的通知。 */
export function clearSyncError(): void {
  if (state.lastError === null) return;
  commit({ ...state, lastError: null });
}

/** engine.ts 的 syncNow 究竟同步到哪一步了（开始/结束，结束含失败路径）。
    即时状况不落盘：刷新后 initSync 会立刻重新跑一次同步重新给出结论。 */
export function markSyncing(syncing: boolean): void {
  commit({ ...state, syncing });
}

/** 成功完成一次同步后调用，驱动 UI 的瞬态绿闪。单调递增，UI 用\"tick 变了没\"
    判断要不要重播一次闪光（详见 successTick 字段注释的去重语义）。 */
export function markSyncSucceeded(): void {
  commit({ ...state, successTick: state.successTick + 1 });
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