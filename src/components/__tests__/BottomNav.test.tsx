import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { BottomNav } from '@/components/BottomNav';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

beforeEach(() => {
  usePathname.mockReturnValue('/ledger');
});

describe('BottomNav', () => {
  it('渲染记账/历史/统计三个入口', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('href', 'http://localhost:3000/ledger');
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty('href', 'http://localhost:3000/history');
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty('href', 'http://localhost:3000/stats');
  });

  it('当前所在页的入口带 aria-current', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('ariaCurrent', 'page');
    expect(screen.getByRole('link', { name: 'Stats' }).hasAttribute('aria-current')).toBe(false);
  });

  it('/history 与 /stats 上各自正确点亮 aria-current', () => {
    usePathname.mockReturnValue('/history');
    const { unmount } = render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty('ariaCurrent', 'page');
    unmount();

    usePathname.mockReturnValue('/stats');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty('ariaCurrent', 'page');
    expect(screen.getByRole('link', { name: 'History' }).hasAttribute('aria-current')).toBe(false);
  });
});
