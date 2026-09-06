import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import {
  markUnsynced,
  markSynced,
  markSyncFailed,
  clearSyncError,
  getSnapshot,
} from '@/lib/sync/status';

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearSyncError();
});

describe('SyncStatusDot', () => {
  it('没有未同步项时显示已同步', () => {
    render(<SyncStatusDot />);
    expect(screen.getByText('Synced')).toBeDefined();
  });

  it('有未同步项时显示数量', () => {
    markUnsynced(['tx1', 'tx2']);
    render(<SyncStatusDot />);
    expect(screen.getByText('2 pending sync')).toBeDefined();
  });

  it('上一次同步失败时把原因挂在 title 上（用户反馈：一直显示待同步但完全看不出是"还没试"还是"试了失败"）', () => {
    markUnsynced(['tx1']);
    markSyncFailed('Drive 更新文件失败：HTTP 401');
    render(<SyncStatusDot />);
    expect(screen.getByRole('status')).toHaveProperty(
      'title',
      'Last sync failed: Drive 更新文件失败：HTTP 401',
    );
  });

  it('没有失败记录时不挂 title', () => {
    markUnsynced(['tx1']);
    render(<SyncStatusDot />);
    expect(screen.getByRole('status')).toHaveProperty('title', '');
  });
});