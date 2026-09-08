import type { Transaction } from '@/lib/ai/schema';
import { randomUUID } from '@/lib/platform';

export const SCHEMA_VERSION = 1 as const;

const DEVICE_ID_KEY = 'justsayit.deviceId';

/**
 * 设备标识。每台设备在 Drive 上写自己独立的日志文件（spec §7），
 * 这是"设备间永不写同一文件、因而无写冲突"的基础。
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

type BaseEvent = {
  eventId: string;
  deviceId: string;
  /** 事件写入时刻。注意：统计口径用 Transaction.date，不用这个字段（§6.4） */
  createdAt: string;
  schemaVersion: typeof SCHEMA_VERSION;
};

/**
 * 离线排队功能已下线（离线时不再支持记账，只支持查看/编辑已有账目——AI
 * 结构化本来就要联网+登录，假装能排队只是把"记不上"的问题延后，不是
 * 解决它）。这两个事件类型和下面 `LedgerEvent` 联合类型里的对应分支、
 * replay.ts 里吞掉这两种 kind 的 no-op case 都特意保留：万一某台设备的
 * 本地 IndexedDB 里还躺着旧版本产生的 raw_input_queued/resolved 事件，
 * replay() 得认得这两种 kind 才不会在类型收窄或运行时处理上出岔子。
 * 真正"制造"这两种事件的入口（store.ts 的 queueRawInput/resolveRawInput、
 * offlineQueue.ts 整个模块、QueuedRow 组件）已经删掉，不会再有新的这类
 * 事件产生。判别字段用 kind 而非 type——Transaction 已经占用了 type
 * 表示收支方向。
 */
export type RawInputQueuedPayload = {
  id: string;
  text: string;
  localTime: string;
  timeZone: string;
  defaultCurrency: string;
};

export type RawInputResolvedPayload = { queuedId: string };

type RawInputQueuedEvent = BaseEvent & {
  kind: 'raw_input_queued';
  payload: RawInputQueuedPayload;
};
type RawInputResolvedEvent = BaseEvent & {
  kind: 'raw_input_resolved';
  payload: RawInputResolvedPayload;
};

/** 判别字段用 kind 而非 type——Transaction 已经占用了 type 表示收支方向 */
export type LedgerEvent =
  | (BaseEvent & { kind: 'transaction_created'; payload: Transaction })
  | (BaseEvent & {
      kind: 'transaction_amended';
      payload: { id: string; changes: Partial<Omit<Transaction, 'id'>> };
    })
  | (BaseEvent & { kind: 'transaction_deleted'; payload: { id: string } })
  | RawInputQueuedEvent
  | RawInputResolvedEvent;

function base(): BaseEvent {
  return {
    eventId: randomUUID(),
    deviceId: getDeviceId(),
    createdAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
  };
}

export function createTransactionCreated(tx: Transaction): LedgerEvent {
  return { ...base(), kind: 'transaction_created', payload: { ...tx } };
}

export function createTransactionAmended(
  id: string,
  changes: Partial<Omit<Transaction, 'id'>>,
): LedgerEvent {
  return {
    ...base(),
    kind: 'transaction_amended',
    payload: { id, changes: { ...changes } },
  };
}

export function createTransactionDeleted(id: string): LedgerEvent {
  return { ...base(), kind: 'transaction_deleted', payload: { id } };
}
