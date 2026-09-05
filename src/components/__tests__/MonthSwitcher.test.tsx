import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { MonthSwitcher } from '@/components/MonthSwitcher';

beforeEach(() => {
  // 用固定「当前月」让 next 禁用语义可测；2026-09 作为系统时钟
  vi.setSystemTime(new Date('2026-09-15T00:00:00Z'));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const noop = vi.fn();

describe('MonthSwitcher', () => {
  it('没有最早月份（无任何账目）时 ‹ 禁用、› 可用（不在当前月）', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 7, 1)} // 2026-08 < 当前月 2026-09
        onChange={noop}
        earliestMonth={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', false);
  });

  it('month 已达到最早月份时 ‹ 禁用', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 5, 1)}
        onChange={noop}
        earliestMonth={new Date(2026, 5, 1)}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', true);
  });

  it('month 早于最早月份时 ‹ 可用', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 5, 1)}
        onChange={noop}
        earliestMonth={new Date(2026, 8, 1)}
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', false);
  });

  it('month 是当前日历月时 › 禁用（禁止浏览未来）', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 8, 1)} // 2026-09
        onChange={noop}
        earliestMonth={new Date(2026, 5, 1)}
      />,
    );
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', true);
  });

  it('点击 ‹ › 以原来的月为基准偏移并调用 onChange', () => {
    const onChange = vi.fn();
    render(
      <MonthSwitcher
        month={new Date(2026, 6, 1)} // 2026-07，前后都不触边界（当前月 09）
        onChange={onChange}
        earliestMonth={new Date(2026, 0, 1)}
      />,
    );
    screen.getByRole('button', { name: 'Previous month' }).click();
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 5, 1, 12));
    screen.getByRole('button', { name: 'Next month' }).click();
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 7, 1, 12));
  });

  it('disabled 时两个按钮都禁用', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 8, 1)}
        onChange={noop}
        earliestMonth={new Date(2026, 5, 1)}
        disabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Previous month' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', true);
  });

  it('月份名按 locale 本地化（en: September 2026）', () => {
    render(
      <MonthSwitcher
        month={new Date(2026, 8, 1)}
        onChange={noop}
        earliestMonth={new Date(2026, 5, 1)}
      />,
    );
    expect(screen.getByText('September 2026')).toBeDefined();
  });

  it('月份名按 locale 本地化（zh: 2026年9月）', async () => {
    localStorage.setItem('justsayit:locale', 'zh');
    render(
      <MonthSwitcher
        month={new Date(2026, 8, 1)}
        onChange={noop}
        earliestMonth={new Date(2026, 5, 1)}
      />,
    );
    // LocaleProvider 首帧用默认 en，挂载后读取本地存储切到 zh
    await waitFor(() => expect(screen.getByText('2026年9月')).toBeDefined());
    expect(screen.getByRole('button', { name: '上月' })).toBeDefined();
  });
});