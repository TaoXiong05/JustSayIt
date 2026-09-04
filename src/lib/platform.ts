/**
 * iOS 判定（含 iPad——iPadOS 13 起 UA 默认伪装成 Mac，但这里只处理
 * 经典 UA 字符串判定；iPadOS 的 Mac 伪装场景不影响本产品逻辑，
 * 因为那种情况下平台约束（ITP 等）与真正的 macOS Safari 一致）。
 */
export function isIOS(ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  return /iPhone|iPad|iPod/.test(ua);
}

/** 是否已安装到主屏幕运行（spec §8.1：PWA 有独立储存容器与 ITP 豁免）。 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * `crypto.randomUUID()` 要求 secure context（HTTPS 或 localhost），
 * 局域网设备用 http://<ip 或域名>:port 访问时该方法不存在（会是
 * undefined），但 `crypto.getRandomValues()` 没有这个限制，故在此兜底。
 */
export function randomUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}