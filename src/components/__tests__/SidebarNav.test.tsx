import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { SidebarNav } from '@/components/SidebarNav';

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname }));

beforeEach(() => {
  usePathname.mockReturnValue('/');
});

describe('SidebarNav', () => {
  it('渲染三个入口并点亮当前页 aria-current', () => {
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('href', 'http://localhost:3000/');
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty('href', 'http://localhost:3000/history');
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveProperty('href', 'http://localhost:3000/stats');
    expect(screen.getByRole('link', { name: 'Ledger' })).toHaveProperty('ariaCurrent', 'page');
  });

  it('/history 时侧栏同样点亮', () => {
    usePathname.mockReturnValue('/history');
    render(<SidebarNav />);
    expect(screen.getByRole('link', { name: 'History' })).toHaveProperty('ariaCurrent', 'page');
  });
});