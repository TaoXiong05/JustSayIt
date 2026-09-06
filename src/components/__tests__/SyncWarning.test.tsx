import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { render } from '@/test/renderWithLocale';
import { LocaleProvider } from '@/lib/i18n/context';
import { SyncWarning } from '@/components/SyncWarning';
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

beforeEach(() => {
  markSynced(getSnapshot().unsyncedIds);
  clearAuthError();
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

  it('未同步不足 24 小时时不渲染任何内容（spec §8.4：<24h 只用状态点，不打扰）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-05T12:00:00Z'));
    markUnsynced(['tx1']);
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
  });

  it('24-72 小时之间也不渲染任何内容（用户反馈：这一档只靠主屏 SyncStatusDot 常驻的待同步计数体现，不再额外弹提示）', () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00Z'));
    markUnsynced(['tx1']);
    vi.setSystemTime(new Date('2026-09-02T12:00:00Z')); // +36h
    const { container } = render(<SyncWarning />);
    expect(container.textContent).toBe('');
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
    // 授权失败时"重试同步"无法真正修好（旧 refresh token 已经坏了），
    // 主动作是跳转到强制重新同意的登录链接，见 SyncWarning.tsx 的注释。
    const link = screen.getByRole('link', { name: 'Reconnect Google Drive' });
    expect(link).toBeDefined();
    expect(link).toHaveProperty('href', 'http://localhost:3000/api/auth/login?reauth=1');
    expect(screen.queryByRole('button', { name: 'Retry sync' })).toBeNull();
  });

  it('服务端渲染（renderToString，effect 永远不跑）不会调用 shouldPrioritizeInstallGuidance —— 回归：nudgeInstall 曾经在渲染体里直接算，SSR 输出跟真机客户端首次渲染不一致，触发 hydration mismatch（同 InstallBanner.tsx 那次的根因）', () => {
    vi.mocked(isIOS).mockReturnValue(true);
    vi.mocked(isStandalone).mockReturnValue(false);
    vi.mocked(shouldPrioritizeInstallGuidance).mockReturnValue(true);
    markAuthError(); // 确保走 authError/gt72h 那个会用到 nudgeInstall 的分支
    renderToString(
      <LocaleProvider>
        <SyncWarning />
      </LocaleProvider>,
    );
    expect(shouldPrioritizeInstallGuidance).not.toHaveBeenCalled();
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
    expect(screen.getByRole('link', { name: 'Reconnect Google Drive' })).toBeDefined(); // 模态确实在显示
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
});
