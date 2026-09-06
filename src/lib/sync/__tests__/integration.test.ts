import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 只 mock 真正的 I/O 边界（Drive HTTP、IndexedDB）；sync/status.ts、
// sync/init.ts、ledger/store.ts 的真实实现原样跑——这条测试专门盯着
// init.ts（生产 unsyncedIds 用的 id）与 engine.ts（消费/清空 unsyncedIds
// 用的 id）之间的契约是否一致。分开测两边、各自 mock 对方时曾经测不出
// 这类问题（回归：markSynced 曾传 event 自身的 eventId 而不是 transaction
// id，导致 unsyncedIds 永远清不掉，即使上传其实已经成功）。
vi.mock('@/lib/sync/drive', () => ({
  listOwnAppFiles: vi.fn().mockResolvedValue([]),
  downloadFile: vi.fn(),
  upsertOwnFile: vi.fn().mockResolvedValue(undefined),
  serializeEvents: vi.fn(() => ''),
  parseEvents: vi.fn(() => []),
}));
vi.mock('@/lib/ledger/db', () => ({
  appendEvents: vi.fn().mockResolvedValue(undefined),
  readAllEvents: vi.fn().mockResolvedValue([]),
}));

import { addTransactions } from '@/lib/ledger/store';
import { appendEvents, readAllEvents } from '@/lib/ledger/db';
import { upsertOwnFile } from '@/lib/sync/drive';
import { getSnapshot as getSyncSnapshot, markSynced } from '@/lib/sync/status';
import { initSync } from '@/lib/sync/init';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx-integration-1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
};

async function waitUntil(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('等待条件超时');
    await new Promise((r) => setTimeout(r, 5));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // 干净起点：清掉上一个用例可能残留的未同步集合（模块级单例状态）
  markSynced(getSyncSnapshot().unsyncedIds);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'at-1', expiresIn: 3599 }),
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('sync/init.ts 与 sync/engine.ts 的 id 契约', () => {
  it('新建一笔账目 → initSync 标记未同步 → syncNow 成功后 unsyncedIds 真的清空', async () => {
    const cleanup = initSync();
    // initSync() 现在自己先 await 一次 hydrate() 才建立基线、才订阅（见
    // init.ts 的详细注释：不能在 hydrate() 真正落地前就同步取基线快照，
    // 否则会把水合落地时的历史事件误判成"新事件"）。这里用 setTimeout(0)
    // 而不是单次 await Promise.resolve()——把所有排队中的微任务都跑完，
    // 不用去数 hydrate() 内部到底有几层 Promise 链。
    await new Promise((r) => setTimeout(r, 0));

    await addTransactions([tx]);
    expect(getSyncSnapshot().unsyncedIds).toEqual(['tx-integration-1']);

    // addTransactions 内部会调用（mocked）appendEvents(events)——用它捕获
    // 真实生成的事件（含随机 eventId），喂给 engine.ts 的 readAllEvents，
    // 让两边看到的是同一个事件对象（deviceId 一致，才会被 syncNow 当作
    // "本设备事件"处理）
    const appended = vi.mocked(appendEvents).mock.calls[0][0];
    vi.mocked(readAllEvents).mockResolvedValue(appended);

    // initSync 的订阅回调是 fire-and-forget 的 syncNow()，轮询等它跑完
    await waitUntil(() => getSyncSnapshot().unsyncedIds.length === 0);

    cleanup();
  });

  it('回归：新账目恰好在上一次同步仍在飞行中时提交（典型场景：页面刚加载，initSync() 那次无条件同步还没跑完用户就提交了一笔），也能在这次同步跑完后自动补跑一次同步掉，不需要刷新页面（用户反馈原话："提交记录，不刷新页面就一直显示等待同步"）', async () => {
    // 卡住第一次 upsertOwnFile，模拟"上一次同步仍在进行中"
    let releaseFirstUpload: () => void = () => {};
    const firstUploadGate = new Promise<void>((resolve) => {
      releaseFirstUpload = resolve;
    });
    let uploadCallCount = 0;
    vi.mocked(upsertOwnFile).mockImplementation(async () => {
      uploadCallCount++;
      if (uploadCallCount === 1) await firstUploadGate;
    });

    const cleanup = initSync();
    // initSync() 建立基线后发起的那次无条件 syncNow() 此刻正卡在
    // upsertOwnFile 里等 firstUploadGate——也就是"上一次同步仍在飞行中"
    await new Promise((r) => setTimeout(r, 0));

    // 新账目恰好在这次同步还没跑完时提交
    await addTransactions([tx]);
    expect(getSyncSnapshot().unsyncedIds).toEqual(['tx-integration-1']);

    const appended = vi.mocked(appendEvents).mock.calls[0][0];
    vi.mocked(readAllEvents).mockResolvedValue(appended);

    // 放行第一次上传——飞行中的这次同步跑完后应该自动补跑一次，把刚才
    // 提交的账目也同步掉，不需要任何额外触发（比如刷新页面重新走一遍
    // initSync）
    releaseFirstUpload();
    await waitUntil(() => getSyncSnapshot().unsyncedIds.length === 0);
    expect(uploadCallCount).toBeGreaterThanOrEqual(2);

    cleanup();
  });
});
