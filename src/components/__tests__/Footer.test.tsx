import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { Footer } from '@/components/Footer';

describe('Footer（全站通用页脚）', () => {
  beforeEach(() => localStorage.clear());

  it('渲染隐私政策/服务条款链接与英文版权声明（默认语言）', () => {
    render(<Footer />);
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveProperty(
      'href',
      'http://localhost:3000/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveProperty(
      'href',
      'http://localhost:3000/terms',
    );
    expect(screen.getByText(/© 2026 Tao Xiong\. All rights reserved\./)).toBeDefined();
  });

  it('切到中文后显示中文版权声明与中文链接文案', () => {
    localStorage.setItem('justsayit:locale', 'zh');
    render(<Footer />);
    expect(screen.getByRole('link', { name: '隐私政策' })).toBeDefined();
    expect(screen.getByRole('link', { name: '服务条款' })).toBeDefined();
    expect(screen.getByText(/© 2026 Tao Xiong 保留所有权利。/)).toBeDefined();
  });
});
