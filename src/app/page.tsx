'use client';

import { useState, useCallback } from 'react';
import { Composer } from '@/components/Composer';
import { LedgerList } from '@/components/LedgerList';
import { PendingRow } from '@/components/PendingRow';
import { UndoToast } from '@/components/UndoToast';
import { useLedger } from '@/lib/ledger/useLedger';
import { addTransactions, removeTransaction, knownMerchants } from '@/lib/ledger/store';
import { normalizeMerchant } from '@/lib/ledger/normalize';
import { toTransaction, type AiTransaction } from '@/lib/ai/schema';

const DEFAULT_CURRENCY = 'AUD';

export default function Home() {
  const ledger = useLedger();
  const transactions = ledger.transactions;   // 稳定引用，无需 memo（见 Task 14）

  const [pending, setPending] = useState<string[]>([]);
  const [lastAdded, setLastAdded] = useState<string[]>([]);

  const clearToast = useCallback(() => setLastAdded([]), []);

  const undo = useCallback(async () => {
    for (const id of lastAdded) await removeTransaction(id);
    setLastAdded([]);
  }, [lastAdded]);

  async function handleSubmit(text: string) {
    // 乐观插入：提交瞬间就出现占位行，用户不面对 spinner（spec §9、§16.5）
    setPending((p) => [...p, text]);
    try {
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
      if (txs.length > 0) setLastAdded(txs.map((t) => t.id));
    } finally {
      setPending((p) => p.filter((t) => t !== text));
    }
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      {pending.length > 0 && (
        <ul>
          {pending.map((t, i) => (
            <PendingRow key={`${t}-${i}`} text={t} />
          ))}
        </ul>
      )}
      <LedgerList transactions={transactions} />
      {lastAdded.length > 0 && (
        <UndoToast count={lastAdded.length} onUndo={undo} onDismiss={clearToast} />
      )}
      <Composer onSubmit={handleSubmit} />
    </main>
  );
}
