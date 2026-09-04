import { openDB, type IDBPDatabase } from 'idb';
import type { LedgerEvent } from '@/lib/ledger/events';

const DB_NAME = 'justsayit';
const DB_VERSION = 1;
const STORE = 'events';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          // eventId 作为主键 —— 重复写入同一事件时自动覆盖，
          // 这正是多设备日志合并去重所需要的语义（§7）
          database.createObjectStore(STORE, { keyPath: 'eventId' });
        }
      },
    });
  }
  return dbPromise;
}

export async function appendEvents(events: LedgerEvent[]): Promise<void> {
  if (events.length === 0) return;
  const d = await db();
  const tx = d.transaction(STORE, 'readwrite');
  for (const e of events) tx.store.put(e);
  await tx.done;
}

export async function readAllEvents(): Promise<LedgerEvent[]> {
  const d = await db();
  return (await d.getAll(STORE)) as LedgerEvent[];
}

export async function clearAllEvents(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}
