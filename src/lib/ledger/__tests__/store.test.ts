import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllEvents, appendEvents } from '@/lib/ledger/db';
import { createTransactionCreated } from '@/lib/ledger/events';
import {
  subscribe,
  getSnapshot,
  hydrate,
  addTransactions,
  removeTransaction,
  amendTransaction,
  knownMerchants,
  queueRawInput,
  resolveRawInput,
  pendingRawInputsFrom,
  pendingRawInputs,
  getEventsSnapshot,
} from '@/lib/ledger/store';
import type { Transaction } from '@/lib/ai/schema';

const tx = (id: string, over: Partial<Transaction> = {}): Transaction => ({
  id,
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-04',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
  ...over,
});

beforeEach(async () => {
  localStorage.clear();
  await clearAllEvents();
  await hydrate();
});

describe('store', () => {
  it('初始为空账本', () => {
    expect(getSnapshot().transactions).toEqual([]);
  });

  it('getSnapshot 在无变更时返回同一引用（useSyncExternalStore 的硬性要求）', () => {
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it('addTransactions 后引用更换且内容更新', async () => {
    const before = getSnapshot();
    await addTransactions([tx('a')]);
    const after = getSnapshot();
    expect(after).not.toBe(before);
    expect(after.transactions).toHaveLength(1);
  });

  it('变更时通知订阅者', async () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    await addTransactions([tx('a')]);
    expect(calls).toBe(1);
    off();
    await addTransactions([tx('b')]);
    expect(calls).toBe(1);
  });

  it('变更已持久化——重新 hydrate 后仍在', async () => {
    await addTransactions([tx('a')]);
    await hydrate();
    expect(getSnapshot().transactions.map((t) => t.id)).toEqual(['a']);
  });

  it('removeTransaction 移除账目', async () => {
    await addTransactions([tx('a'), tx('b')]);
    await removeTransaction('a');
    expect(getSnapshot().transactions.map((t) => t.id)).toEqual(['b']);
  });

  it('knownMerchants 去重返回历史商户名', async () => {
    await addTransactions([
      tx('a', { merchant: 'Woolworths' }),
      tx('b', { merchant: 'Woolworths' }),
      tx('c', { merchant: null }),
      tx('d', { merchant: 'Coles' }),
    ]);
    expect(knownMerchants().sort()).toEqual(['Coles', 'Woolworths']);
  });

  it('删除账目后 knownMerchants 仍保留其商户名（历史写法不因删除而丢失）', async () => {
    await addTransactions([tx('a', { merchant: 'Woolworths' })]);
    await removeTransaction('a');
    expect(knownMerchants()).toEqual(['Woolworths']);
  });
});

describe('离线队列', () => {
  const ctx = {
    text: '买菜50块',
    localTime: '2026-09-05T10:00:00+10:00',
    timeZone: 'Australia/Sydney',
    defaultCurrency: 'AUD',
  };

  it('queueRawInput 落盘一个 raw_input_queued 事件并返回其 id', async () => {
    const id = await queueRawInput(ctx);
    expect(id).toBeTruthy();
    expect(pendingRawInputs()).toEqual([{ id, ...ctx }]);
  });

  it('resolveRawInput 后该条从 pendingRawInputs 消失，且对应账目已入账', async () => {
    const id = await queueRawInput(ctx);
    const tx: Transaction = {
      id: 'tx-from-queue',
      type: 'EXPENSE',
      amountCents: 5000,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: '买菜',
    };
    await resolveRawInput(id, [tx]);
    expect(pendingRawInputs()).toEqual([]);
    expect(getSnapshot().transactions.map((t) => t.id)).toContain('tx-from-queue');
  });

  it('resolveRawInput 允许空数组（AI 判定这句话不含收支信息）', async () => {
    const id = await queueRawInput(ctx);
    await resolveRawInput(id, []);
    expect(pendingRawInputs()).toEqual([]);
  });

  it('pendingRawInputsFrom 是纯函数：同一份事件多次调用返回值相等（可安全放进 useMemo 依赖）', () => {
    const events = getEventsSnapshot();
    expect(pendingRawInputsFrom(events)).toEqual(pendingRawInputsFrom(events));
  });

  it('getEventsSnapshot 在没有新事件时返回同一引用（同 getSnapshot 的稳定性规则，§6.6）', () => {
    const a = getEventsSnapshot();
    const b = getEventsSnapshot();
    expect(a).toBe(b);
  });

  it('getEventsSnapshot 在 append 后返回新引用', async () => {
    const before = getEventsSnapshot();
    await queueRawInput(ctx);
    expect(getEventsSnapshot()).not.toBe(before);
  });
});

describe('amendTransaction', () => {
  it('追加 transaction_amended 事件，账本里对应账目的字段被更新', async () => {
    const txData: Transaction = {
      id: 'tx-amend-1',
      type: 'EXPENSE',
      amountCents: 2500,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: '早餐',
    };
    await addTransactions([txData]);
    await amendTransaction('tx-amend-1', { category: 'TRANSPORT', amountCents: 3000 });

    const updated = getSnapshot().transactions.find((t) => t.id === 'tx-amend-1');
    expect(updated?.category).toBe('TRANSPORT');
    expect(updated?.amountCents).toBe(3000);
    expect(updated?.description).toBe('早餐'); // 没改的字段原样保留
  });

  it('修改 merchant 后，该写法进入 knownMerchants（回归：既有逻辑，验证未被破坏）', async () => {
    const txData: Transaction = {
      id: 'tx-amend-2',
      type: 'EXPENSE',
      amountCents: 1000,
      currency: 'AUD',
      date: '2026-09-05',
      category: 'FOOD',
      merchant: null,
      description: 'x',
    };
    await addTransactions([txData]);
    await amendTransaction('tx-amend-2', { merchant: 'Costco' });
    expect(knownMerchants()).toContain('Costco');
  });
});

describe('跨标签页/窗口同步（用户反馈：浏览器标签页和已安装的 PWA 窗口各自独立，一边改了账目另一边不刷新就看不到）', () => {
  it('本地写入（push）后广播通知，另一个"标签页"（独立的 BroadcastChannel 实例）能收到', async () => {
    const otherTab = new BroadcastChannel('justsayit-ledger-sync');
    const received = new Promise<void>((resolve) => {
      otherTab.onmessage = () => resolve();
    });
    await addTransactions([tx('tx-broadcast-1')]);
    await received; // 不超时即通过；挂起会被 vitest 的用例超时兜底
    otherTab.close();
  });

  it('收到其它标签页的广播后，重新从 IndexedDB 读取最新状态（不是单纯清空/瞎猜）', async () => {
    // 模拟"另一个标签页"：绕过这个模块的 push()，直接往 IndexedDB 写一条
    // 这个模块从未见过的事件，再广播——验证收到通知那一方确实重新读了
    // 真相来源，而不是本地状态没变就误以为"没有更新"。
    const newEvent = createTransactionCreated(tx('tx-from-other-tab'));
    await appendEvents([newEvent]);
    const otherTab = new BroadcastChannel('justsayit-ledger-sync');
    otherTab.postMessage('changed');
    otherTab.close();

    await vi.waitFor(() => {
      expect(getSnapshot().transactions.some((t) => t.id === 'tx-from-other-tab')).toBe(true);
    });
  });
});
