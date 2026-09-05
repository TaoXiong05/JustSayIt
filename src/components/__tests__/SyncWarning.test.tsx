import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { render } from '@/test/renderWithLocale';
import { SyncWarning } from '@/components/SyncWarning';
import { Toaster } from '@/components/Toaster';
import { resetToastStoreForTests } from '@/lib/toast';
import {
  markUnsynced,
  markSynced,
  markAuthError,
  clearAuthError,
  getSnapshot,
} from '@/lib/sync/status';

vi.mock('@/lib/sync/export', () => ({ exportBackup: vi.fn() }));
vi.mock('@/lib/sync/engine', () => ({ syncNow: vi.fn() }));
vi.mock('@/lib/platform', () => ({ isIOS: vi.fn(), isStandalone: vi.fn() }));
vi.mock('@/lib/pwa/install', () => ({ shouldPrioritizeInstallGuidance: vi.fn() }));

import { isIOS, isStandalone } from '@/lib/platform';
import { shouldPrioritizeInstallGuidance } from '@/lib/pwa/install';

/** 24–72h 档现在由警告 toast 呈现，需要把全局 <Toaster /> 一并渲染。 */
function renderWarning(ui?: ReactElement) {
  return render(
    <>
      {ui ?? <SyncWarning />}
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
  resetToastStoreForTests();
  vi.mocked(isIOS).mockReturnValue(false);
  vi.mocked(isStandalone).mockReturnValue(false);
  vi.mocked(shouldPrioritizeInstallGuidance).mockReturnValue(false);
});
afterEach(() => vi.useRealTimers());

describe('SyncWarning', () => {
  it('没有未同步项、没有 authError 时不渲染任何内容', () => {
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('未同步不足 24 小时时不渲染横幅（spec §8.4：<24h 只用状态点，不打扰）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    markUnsynced(['tx1']);
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('24-72 小时之间以警告 toast 呈现（不再渲染内联横幅）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z')); // +36h
    renderWarning();
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });

  it('超过 72 小时渲染模态，含重试同步与导出备份两个动作', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-04T00:00:00Z')); // +72h
    render(<SyncWarning />);
    expect(screen.getByText(/unsynced for a while/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeDefined();
  });

  it('authError 时立刻渲染提示，不看时间阈值（A 类失败，spec §8.3）', () => {
    markAuthError();
    render(<SyncWarning />);
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined();
  });
});

describe('SyncWarning 平台分支文案（spec §8.6）', () => {
  it('iOS + 未安装时用"可能被清除"文案', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    renderWarning();
    expect(screen.getByText(/Safari may clear this data/)).toBeDefined();
  });

  it('iOS 但已安装时不用"可能被清除"文案（有 ITP 豁免，spec §8.2）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    renderWarning();
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
    expect(screen.queryByText(/Safari may clear/)).toBeNull();
  });

  it('非 iOS 平台一律用"尚未备份到云端"文案', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z'));
    renderWarning();
    expect(screen.getByText(/Not backed up to the cloud yet/)).toBeDefined();
  });
});

describe('SyncWarning 安装引导提权（spec §8.8）', () => {
  const NUDGE = /Add to Home Screen to keep this device's data safe/;

  beforeEach(() => {
    // 用真实的三条件逻辑驱动这个 mock，这样下面的用例既验证了"接线接上了"，
    // 也验证了传进去的 hasUnsyncedData 参数确实来自当前同步状态。
    vi.mocked(shouldPrioritizeInstallGuidance).mockImplementation(
      ({ hasUnsyncedData }) => isIOS() && !isStandalone() && hasUnsyncedData,
    );
  });

  /** 制造一个 >72h 的模态场景（模态文案本身是通用的，不含任何安装引导） */
  function renderWithModal() {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z')); // +96h
    return render(<SyncWarning />);
  }

  it('iOS + 未安装 + 有未同步数据时，模态里追加一句安装引导', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    renderWithModal();
    expect(screen.getByText(NUDGE)).toBeDefined();
    expect(shouldPrioritizeInstallGuidance).toHaveBeenCalledWith({ hasUnsyncedData: true });
  });

  it('iOS 但已安装时不追加（已有 ITP 豁免，没什么可劝的）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(true);
    renderWithModal();
    expect(screen.getByText(/unsynced for a while/)).toBeDefined();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('非 iOS 平台不追加', () => {
    vi.mocked(isIOS).mockReturnValue(false);
    vi.mocked(isStandalone).mockReturnValue(false);
    renderWithModal();
    expect(screen.getByText(/unsynced for a while/)).toBeDefined();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });

  it('A 类失败但没有未同步数据时不追加（三条件缺一不可）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    markAuthError();
    render(<SyncWarning />);
    expect(screen.getByRole('button', { name: 'Retry sync' })).toBeDefined(); // 模态确实在显示
    expect(screen.queryByText(NUDGE)).toBeNull();
    expect(shouldPrioritizeInstallGuidance).toHaveBeenCalledWith({ hasUnsyncedData: false });
  });

  it('A 类失败且有未同步数据时追加（此时三条件齐了）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    markUnsynced(['tx1']);
    markAuthError();
    render(<SyncWarning />);
    expect(screen.getByText(NUDGE)).toBeDefined();
  });

  it('24-72h 的 iOS toast 不重复这句引导——横幅文案本身已经是这条建议了', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z')); // +36h
    renderWarning();
    expect(screen.getByText(/Add to Home Screen to keep it safe/)).toBeDefined();
    expect(screen.queryByText(NUDGE)).toBeNull();
  });
});