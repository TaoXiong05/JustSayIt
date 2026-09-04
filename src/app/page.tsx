'use client';

import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { useLedger } from '@/lib/ledger/useLedger';
import { addTransactions, knownMerchants } from '@/lib/ledger/store';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { toTransaction, type AiTransaction } from '@/lib/ai/schema';

const DEFAULT_CURRENCY = 'AUD';

export default function Home() {
  const ledger = useLedger();
  // getSnapshot 返回缓存引用，ledger.transactions 本身即稳定，直接读即可。
  // §6.6 的 useMemo 规则针对的是真正的派生（筛选/排序/分组），Plan 1 尚无此类。
  const transactions = ledger.transactions;

  async function handleSubmit(text: string) {
    const res = await fetch('/api/structure', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        localTime: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        defaultCurrency: DEFAULT_CURRENCY,
      }),
    });
    if (!res.ok) throw new Error('结构化失败');

    const { records } = (await res.json()) as { records: AiTransaction[] };
    const known = knownMerchants();
    const txs = records.map((r) =>
      toTransaction(
        { ...r, merchant: normalizeMerchant(r.merchant, known) },
        { id: crypto.randomUUID(), defaultCurrency: DEFAULT_CURRENCY },
      ),
    );
    await addTransactions(txs);
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      <LedgerList transactions={transactions} />
      <Composer onSubmit={handleSubmit} />
    </main>
  );
}
