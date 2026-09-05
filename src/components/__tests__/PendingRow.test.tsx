import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { PendingRow } from '@/components/PendingRow';

describe('PendingRow', () => {
  it('普通提交（未经语音）不显示"刚刚是说出来的"标记', () => {
    render(<PendingRow text="早餐麦当劳25" />);
    expect(screen.getByText('早餐麦当劳25')).toBeDefined();
    expect(document.querySelector('svg.lucide-mic')).toBeNull();
  });

  it('经语音回填提交的占位行显示 mic 标记（改善方向 #3）', () => {
    render(<PendingRow text="Woolworths 买菜" viaVoice />);
    expect(screen.getByText('Woolworths 买菜')).toBeDefined();
    expect(document.querySelector('svg.lucide-mic')).not.toBeNull();
  });
});
