import { toTransaction, AiResponseSchema, type Transaction } from '@/lib/ai/schema';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { knownMerchants } from '@/lib/ledger/store';
import { throwApiError } from '@/lib/apiError';
import { randomUUID } from '@/lib/platform';

export type StructureRequestContext = {
  localTime: string;
  timeZone: string;
  defaultCurrency: string;
};

/**
 * 文本 → 入库形态的 Transaction[]。page.tsx 的在线提交与
 * lib/ledger/offlineQueue.ts 的联网后补跑共用这同一段逻辑，
 * 避免两处对 AI 响应的校验/商户归一化行为漂移。
 * 不在这里 addTransactions——写入时机由调用方决定（离线补跑还要
 * 同时追加 raw_input_resolved，见 store.ts 的 resolveRawInput）。
 */
export async function structureTextToTransactions(
  text: string,
  ctx: StructureRequestContext,
): Promise<Transaction[]> {
  const res = await fetch('/api/structure', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, ...ctx }),
  });
  if (!res.ok) await throwApiError(res, '结构化失败');

  // 运行时校验，而非类型断言：写入不可变事件日志前的最后一道防线。
  const { records } = AiResponseSchema.parse(await res.json());
  const known = knownMerchants();
  return records.map((r) =>
    toTransaction(
      { ...r, merchant: normalizeMerchant(r.merchant, known) },
      { id: randomUUID(), defaultCurrency: ctx.defaultCurrency },
    ),
  );
}