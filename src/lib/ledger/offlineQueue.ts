import { pendingRawInputs, resolveRawInput } from '@/lib/ledger/store';
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
      } catch {
        // 保留在队列里，不往上抛——一条补跑失败不该打断循环里其它条目
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
 */
export function initOfflineQueueAutoRetry(): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => void retryPendingInputs();
  window.addEventListener('online', handler);
  if (navigator.onLine) void retryPendingInputs();
  return () => window.removeEventListener('online', handler);
}