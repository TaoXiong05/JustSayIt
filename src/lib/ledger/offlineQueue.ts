import { pendingRawInputs, resolveRawInput, hydrate } from '@/lib/ledger/store';
import { structureTextToTransactions } from '@/lib/ledger/structureAndSave';

let retrying = false;

/**
 * 补跑全部排队中的离线输入（spec §9：联网后自动补跑）。
 * 单条失败不中断其它条目——网络刚恢复时偶发的第一次请求失败很常见，
 * 保留在队列里，下次 online 事件或下次显式调用再试。
 */
export async function retryPendingInputs(): Promise<void> {
  if (retrying) return; // 避免并发的多个 online 事件重复补跑同一批
  retrying = true;
  try {
    for (const item of pendingRawInputs()) {
      try {
        const txs = await structureTextToTransactions(item.text, {
          localTime: item.localTime,
          timeZone: item.timeZone,
          defaultCurrency: item.defaultCurrency,
        });
        await resolveRawInput(item.id, txs);
      } catch (err) {
        // 保留在队列里，不往上抛——一条补跑失败不该打断循环里其它条目。
        // 但要留下痕迹：静默失败会让"排队中"永远停在界面上，看不出是
        // 没重试过还是重试了没成功（同 sync/engine.ts 那次的教训）。
        console.warn('[justsayit] 离线排队项补跑失败：', err);
      }
    }
  } finally {
    retrying = false;
  }
}

/**
 * 应用启动时调用一次：监听 online 事件自动补跑；若启动时已经在线
 * （比如离线记了几笔、下次打开应用时网络已经恢复），立即补跑一次。
 * 返回取消订阅函数。
 *
 * 启动那次补跑必须等 hydrate() 落地之后再做（回归：曾经在这里同步调用，
 * 而排队项是从 IndexedDB 异步读回来的，那一刻 pendingRawInputs() 恒为
 * 空数组——什么都没补跑，却把 retrying 走了一遍。此后只要浏览器一直在线，
 * online 事件就永远不会触发，这些排队项再也等不到任何一次重试，界面上
 * 永远停在"排队中"。用户反馈原话："一直 queued，没有重试"）。
 * hydrate() 是幂等的，跟 useLedger()/initSync() 各自那次重复调用无副作用。
 */
export function initOfflineQueueAutoRetry(): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelled = false;
  const handler = () => void retryPendingInputs();
  window.addEventListener('online', handler);
  void hydrate().then(() => {
    if (cancelled) return;
    if (navigator.onLine) void retryPendingInputs();
  });
  return () => {
    cancelled = true;
    window.removeEventListener('online', handler);
  };
}