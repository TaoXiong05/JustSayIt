import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/ledger/db', () => ({ readAllEvents: vi.fn() }));

import { exportBackup } from '@/lib/sync/export';
import { readAllEvents } from '@/lib/ledger/db';

afterEach(() => vi.restoreAllMocks());

describe('exportBackup', () => {
  it('把全部事件序列化成 JSON 并触发浏览器下载', async () => {
    vi.mocked(readAllEvents).mockResolvedValue([
      { eventId: 'e1', kind: 'transaction_created' } as never,
    ]);

    const clickSpy = vi.fn();
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockReturnValue({ click: clickSpy, href: '', download: '' } as unknown as HTMLAnchorElement);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    await exportBackup();

    expect(readAllEvents).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith('a');
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});