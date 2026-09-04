import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { QueuedRow } from '@/components/QueuedRow';

describe('QueuedRow', () => {
  it('显示原文与离线待处理提示', () => {
    render(<QueuedRow text="买菜50块" />);
    expect(screen.getByText('买菜50块')).toBeDefined();
    expect(screen.getByText(/Queued offline/)).toBeDefined();
  });
});