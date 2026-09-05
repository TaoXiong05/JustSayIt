import { isIOS, isStandalone } from '@/lib/platform';

type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let capturedEvent: BeforeInstallPromptEvent | null = null;

/**
 * 捕获 Chrome/Android 的 beforeinstallprompt 事件（iOS 没有这个 API，
 * 只能靠手动引导，见 Task 13 的 InstallBanner）。阻止浏览器自带的
 * 迷你信息栏，改由我们自己的引导 UI 决定何时、以什么优先级出现
 * （spec §8.8）。
 */
export function initInstallPromptCapture(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    e.preventDefault();
    capturedEvent = e as BeforeInstallPromptEvent;
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => {
    window.removeEventListener('beforeinstallprompt', handler);
    capturedEvent = null;
  };
}

export function canPromptInstall(): boolean {
  return capturedEvent !== null;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!capturedEvent) return 'unavailable';
  capturedEvent.prompt();
  const { outcome } = await capturedEvent.userChoice;
  capturedEvent = null;
  return outcome;
}

/**
 * 检测到「iOS + 未安装 + 有未同步数据」时，安装引导提升为高优先级
 * （spec §8.8）：此刻安装能一次性解决 ITP 清除与无法推送两个问题，
 * 且用户正处在能听进去的情境（刚看到"尚未同步"的预警）。
 */
export function shouldPrioritizeInstallGuidance(opts: { hasUnsyncedData: boolean }): boolean {
  return isIOS() && !isStandalone() && opts.hasUnsyncedData;
}
