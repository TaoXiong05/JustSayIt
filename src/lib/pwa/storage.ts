/**
 * 申请持久化存储，避免磁盘压力下被驱逐（spec §6.3）。
 * 不是所有浏览器都实现这个 API（Safari 长期不支持），静默返回 false。
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

/** 本地已用/配额字节数（spec §6.3："本地已用 X MB / 配额 Y MB"）。 */
export async function getStorageEstimate(): Promise<{ usageBytes: number; quotaBytes: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage === undefined || quota === undefined) return null;
  return { usageBytes: usage, quotaBytes: quota };
}
