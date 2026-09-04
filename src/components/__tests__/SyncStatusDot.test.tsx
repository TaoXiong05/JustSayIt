import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SyncStatusDot } from '@/components/SyncStatusDot';
import { markUnsynced, markSynced, getSnapshot } from '@/lib/sync/status';

beforeEach(() => markSynced(getSnapshot().unsyncedIds));

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
});