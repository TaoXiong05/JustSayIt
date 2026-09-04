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
import { markSynced, markAuthError } from '@/lib/sync/status';
import { readAllEvents, appendEvents } from '@/lib/ledger/db';
import { hydrate } from '@/lib/ledger/store';

const ownEvent = { eventId: 'e1', deviceId: 'device-1', kind: 'transaction_created' };
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
});
afterEach(() => vi.unstubAllGlobals());

describe('syncNow', () => {
  it('上传本设备事件、标记已同步，没有其它设备文件时不下载', async () => {
    await syncNow();
    expect(upsertOwnFile).toHaveBeenCalledWith('at-1', 'device-1', expect.any(String));
    expect(markSynced).toHaveBeenCalledWith(['e1']);
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

  it('并发调用时后一次直接跳过', async () => {
    const first = syncNow();
    const second = syncNow();
    await Promise.all([first, second]);
    expect(upsertOwnFile).toHaveBeenCalledTimes(1);
  });
});