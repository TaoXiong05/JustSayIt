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