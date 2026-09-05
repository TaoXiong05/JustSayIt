import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { BottomNav } from '@/components/BottomNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('BottomNav', () => {
  it('渲染记账与统计两个入口', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('href', 'http://localhost:3000/');
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty('href', 'http://localhost:3000/stats');
  });

  it('当前所在页的入口带 aria-current', () => {
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('ariaCurrent', 'page');
    expect(screen.getByRole('link', { name: 'Stats' }).hasAttribute('aria-current')).toBe(false);
  });
});
