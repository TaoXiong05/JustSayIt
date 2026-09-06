import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/sync/drive', () => ({
  listOwnAppFiles: vi.fn(),
  downloadFile: vi.fn(),
  upsertOwnFile: vi.fn(),
  serializeEvents: vi.fn((events: unknown[]) => JSON.stringify(events)),
  parseEvents: vi.fn(),
}));
vi.mock('@/lib/sync/status', () => ({
  markUnsynced: vi.fn(),
  markSynced: vi.fn(),
  markAuthError: vi.fn(),
  markSyncFailed: vi.fn(),
  clearSyncError: vi.fn(),
}));
vi.mock('@/lib/ledger/db', () => ({
  readAllEvents: vi.fn(),
  appendEvents: vi.fn(),
}));
vi.mock('@/lib/ledger/store', () => ({ hydrate: vi.fn() }));
vi.mock('@/lib/ledger/events', () => ({ getDeviceId: vi.fn(() => 'device-1') }));

import { syncNow } from '@/lib/sync/engine';
import {
  listOwnAppFiles,
  downloadFile,
  upsertOwnFile,
  parseEvents,
} from '@/lib/sync/drive';
import { markSynced, markAuthError, markSyncFailed, clearSyncError } from '@/lib/sync/status';
import { readAllEvents, appendEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

const ownEvent = {
  eventId: 'e1',
  deviceId: 'device-1',
  kind: 'transaction_created',
  payload: { id: 'tx1' },
};
const otherDeviceEvent = { eventId: 'e2', deviceId: 'device-2', kind: 'transaction_created' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'at-1', expiresIn: 3599 }),
    }),
  );
  vi.mocked(readAllEvents).mockResolvedValue([ownEvent] as never);
  vi.mocked(listOwnAppFiles).mockResolvedValue([]);
  // clearAllMocks 只清调用记录、不清实现——用例里给 upsertOwnFile 设过的
  // mockRejectedValue 会漏到后面的用例里，这里显式恢复成成功。
  vi.mocked(upsertOwnFile).mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('syncNow', () => {
  it('上传本设备事件、标记已同步，没有其它设备文件时不下载', async () => {
    await syncNow();
    expect(upsertOwnFile).toHaveBeenCalledWith('at-1', 'device-1', expect.any(String));
    // markSynced 清的是 transaction id（payload.id），不是 event 自身的 eventId
    // ——两者是不同的 UUID 空间（回归：曾经传错成 eventId，导致 unsyncedIds
    // 永远清不掉）。
    expect(markSynced).toHaveBeenCalledWith(['tx1']);
    expect(downloadFile).not.toHaveBeenCalled();
    expect(appendEvents).not.toHaveBeenCalled();
  });

  it('下载其它设备文件并合并进本地，不下载自己的文件', async () => {
    vi.mocked(listOwnAppFiles).mockResolvedValue([
      { id: 'own-file', name: 'events-device-1.jsonl' },
      { id: 'other-file', name: 'events-device-2.jsonl' },
    ]);
    vi.mocked(downloadFile).mockResolvedValue('raw-content');
    vi.mocked(parseEvents).mockReturnValue([otherDeviceEvent] as never);

    await syncNow();

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(downloadFile).toHaveBeenCalledWith('at-1', 'other-file');
    expect(appendEvents).toHaveBeenCalledWith([otherDeviceEvent]);
    expect(hydrate).toHaveBeenCalled();
  });

  it('拿 access token 失败（DRIVE_REAUTH_REQUIRED）→ markAuthError，不清未同步标记', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: 'x', code: 'DRIVE_REAUTH_REQUIRED' }),
      }),
    );
    await expect(syncNow()).rejects.toThrow();
    expect(markAuthError).toHaveBeenCalled();
    expect(markSynced).not.toHaveBeenCalled();
  });

  it('网络错误（B 类）不调用 markAuthError，错误照常往上抛给调用方', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(syncNow()).rejects.toThrow();
    expect(markAuthError).not.toHaveBeenCalled();
  });

  it('Drive 上传失败（不经过本项目后端、之前完全不可见的那类失败）会被记录下来，不再只是静默地留下一个"待同步"（用户反馈原话：后端日志没报错、网络返回都是 200，为什么前端一直显示待同步）', async () => {
    vi.mocked(upsertOwnFile).mockRejectedValue(new Error('Drive 更新文件失败：HTTP 401'));
    await expect(syncNow()).rejects.toThrow();
    expect(markSyncFailed).toHaveBeenCalledWith('Drive 更新文件失败：HTTP 401');
    expect(markSynced).not.toHaveBeenCalled(); // 上传没成功，绝不能标记成已同步
  });

  it('拿 access token 失败时，除了 markAuthError 也记录失败原因', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(syncNow()).rejects.toThrow();
    expect(markSyncFailed).toHaveBeenCalledWith('Failed to fetch');
  });

  it('同步成功后清掉上一次的失败记录', async () => {
    await syncNow();
    expect(clearSyncError).toHaveBeenCalled();
    expect(markSyncFailed).not.toHaveBeenCalled();
  });

  it('并发调用时后一次不会被丢弃——前一次跑完后自动补跑一次（回归：曾经直接跳过，导致跑在前一次同步还没结束时新增的账目永远等不到一次真正同步它的机会，界面一直显示"待同步"，除非刷新页面重新触发 initSync 的那次无条件 syncNow）', async () => {
    const first = syncNow();
    const second = syncNow();
    await Promise.all([first, second]);
    // 第一次覆盖第二次到达时正在进行的这次同步；第二次不能被静默丢弃，
    // 必须在第一次跑完后自动补跑一次，才能反映第二次到达时点的最新本地状态
    expect(upsertOwnFile).toHaveBeenCalledTimes(2);
  });
});