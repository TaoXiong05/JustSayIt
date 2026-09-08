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
 * 文本 → 入库形态的 Transaction[]。目前唯一调用方是 page.tsx 的在线提交
 * （离线排队补跑那条路径已下线，见 events.ts 里 RawInputQueuedPayload 上
 * 的说明）。不在这里 addTransactions——写入时机由调用方决定。
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