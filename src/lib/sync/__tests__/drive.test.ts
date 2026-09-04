import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listOwnAppFiles,
  downloadFile,
  upsertOwnFile,
  serializeEvents,
  parseEvents,
} from '@/lib/sync/drive';
import { createTransactionCreated } from '@/lib/ledger/events';
import type { Transaction } from '@/lib/ai/schema';

const tx: Transaction = {
  id: 'tx1',
  type: 'EXPENSE',
  amountCents: 2500,
  currency: 'AUD',
  date: '2026-09-05',
  category: 'FOOD',
  merchant: null,
  description: '早餐',
};

afterEach(() => vi.unstubAllGlobals());

describe('serializeEvents / parseEvents', () => {
  it('往返一致（JSONL：一行一个事件）', () => {
    const events = [createTransactionCreated(tx)];
    expect(parseEvents(serializeEvents(events))).toEqual(events);
  });

  it('parseEvents 忽略空行', () => {
    const events = [createTransactionCreated(tx)];
    const withBlankLines = `\n${serializeEvents(events)}\n\n`;
    expect(parseEvents(withBlankLines)).toEqual(events);
  });

  it('空事件列表序列化为空字符串，解析回空数组', () => {
    expect(serializeEvents([])).toBe('');
    expect(parseEvents('')).toEqual([]);
  });
});

describe('listOwnAppFiles', () => {
  it('请求 appDataFolder 并解析 files 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ id: 'f1', name: 'events-d1.jsonl' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const files = await listOwnAppFiles('at-1');
    expect(files).toEqual([{ id: 'f1', name: 'events-d1.jsonl' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('spaces=appDataFolder');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-1');
  });

  it('响应没有 files 字段时返回空数组', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await listOwnAppFiles('at-1')).toEqual([]);
  });

  it('HTTP 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(listOwnAppFiles('at-1')).rejects.toThrow(/401/);
  });
});

describe('downloadFile', () => {
  it('用 alt=media 下载原始内容', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => 'raw-content' });
    vi.stubGlobal('fetch', fetchMock);
    expect(await downloadFile('at-1', 'f1')).toBe('raw-content');
    expect(fetchMock.mock.calls[0][0]).toContain('alt=media');
  });

  it('HTTP 失败时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(downloadFile('at-1', 'missing')).rejects.toThrow(/404/);
  });
});

describe('upsertOwnFile', () => {
  it('文件不存在时用 multipart 创建', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('spaces=appDataFolder')) {
        return Promise.resolve({ ok: true, json: async () => ({ files: [] }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ id: 'new-file-id' }) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await upsertOwnFile('at-1', 'device-1', 'line1\nline2');
    const createCall = fetchMock.mock.calls.find((call) =>
      (call[0] as string).includes('uploadType=multipart'),
    );
    expect(createCall).toBeDefined();
    const [url, init] = createCall as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files/);
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('events-device-1.jsonl');
    expect(String(init.body)).toContain('line1\nline2');
  });

  it('文件已存在时用 PATCH 覆盖内容，不重新创建', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('spaces=appDataFolder')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ files: [{ id: 'existing-id', name: 'events-device-1.jsonl' }] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fetchMock);
    await upsertOwnFile('at-1', 'device-1', 'new-content');
    const updateCall = fetchMock.mock.calls.find(
      (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(updateCall).toBeDefined();
    const [url, init] = updateCall as [string, RequestInit];
    expect(url).toContain('existing-id');
    expect(init.body).toBe('new-content');
  });
});