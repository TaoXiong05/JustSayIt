import { readAllEvents } from '@/lib/ledger/db';

/**
 * 一键导出（spec §8.7）：不依赖授权、网络或平台特性，是整套预警机制里
 * 最坏情况下唯一仍然有效的兜底。直接读本地 IndexedDB，触发文件下载。
 */
export async function exportBackup(): Promise<void> {
  const events = await readAllEvents();
  const json = JSON.stringify(events, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `justsayit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}