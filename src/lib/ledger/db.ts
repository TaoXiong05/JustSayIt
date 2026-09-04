import { openDB, type IDBPDatabase } from 'idb';
import type { LedgerEvent } from '@/lib/ledger/events';

const DB_NAME = 'justsayit';
const DB_VERSION = 1;
const STORE = 'events';

let dbPromise: Promise<IDBPDatabase> | null = null;

const EVENT_ID_INDEX = 'by-eventId';

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE)) {
          // out-of-line 自增主键（不写进对象本身，getAll 按此键顺序返回，
          // 即写入顺序——eventId 是随机 UUID，若拿它当主键，getAll 会按
          // 字典序而非写入序返回，破坏 replay 依赖的因果顺序）。
          // eventId 建唯一索引，用于写入时判重。
          const store = database.createObjectStore(STORE, { autoIncrement: true });
          store.createIndex(EVENT_ID_INDEX, 'eventId', { unique: true });
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
  // 重复写入同一 eventId 时跳过而非覆盖——事件不可变，两次写入的内容
  // 本就该相同；这也顺带处理了同一批次内出现重复 id 的情况。
  // 注意：IDBIndex.getAllKeys() 返回的是匹配记录的主键（这里是自增数字），
  // 不是索引键本身（eventId 字符串）——用它构造 seen 集合永远不会命中，
  // 起不到判重作用。要拿到已存在的 eventId 集合，需读出索引上的完整记录
  // 再取其 eventId 字段。
  const seen = new Set(
    (await tx.store.index(EVENT_ID_INDEX).getAll()).map((e) => e.eventId)
  );
  for (const e of events) {
    if (!seen.has(e.eventId)) {
      tx.store.add(e);
      seen.add(e.eventId);
    }
  }
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
