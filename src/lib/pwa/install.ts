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
 *
 * 必须在应用外壳层（根 layout 的 PersistStorageOnMount）调用，不能等到
 * 用户点进设置页才挂监听：Chrome 只在页面生命周期很早的时候派发一次
 * beforeinstallprompt，挂晚了就永远收不到。
 *
 * 返回的 cleanup 只摘掉事件监听器，**不清空已经捕获到的事件**——捕获到的
 * prompt 事件是一次性的稀缺资源，清掉就再也拿不回来了；它只应该在
 * promptInstall() 真正消费掉之后作废。
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
