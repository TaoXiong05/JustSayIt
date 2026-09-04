import type { Transaction } from '@/lib/ai/schema';

export const SCHEMA_VERSION = 1 as const;

const DEVICE_ID_KEY = 'justsayit.deviceId';

/**
 * 设备标识。每台设备在 Drive 上写自己独立的日志文件（spec §7），
 * 这是"设备间永不写同一文件、因而无写冲突"的基础。
 */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
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

/** 判别字段用 kind 而非 type——Transaction 已经占用了 type 表示收支方向 */
export type LedgerEvent =
  | (BaseEvent & { kind: 'transaction_created'; payload: Transaction })
  | (BaseEvent & {
      kind: 'transaction_amended';
      payload: { id: string; changes: Partial<Omit<Transaction, 'id'>> };
    })
  | (BaseEvent & { kind: 'transaction_deleted'; payload: { id: string } });

function base(): BaseEvent {
  return {
    eventId: crypto.randomUUID(),
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
