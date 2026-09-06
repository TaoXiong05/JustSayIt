import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import TermsOfServicePage from '@/app/terms/page';

describe('服务条款页（跟随当前 UI 语言，不同时显示两种）', () => {
  beforeEach(() => localStorage.clear());

  it('默认（英文）只显示英文正文，不显示中文正文', () => {
    render(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeDefined();
    expect(screen.getByText(/AI-assisted entries can be wrong/)).toBeDefined();
    expect(screen.queryByText(/AI 辅助生成的记录可能出错/)).toBeNull();
  });

  it('切到中文后只显示中文正文，不显示英文正文', () => {
    localStorage.setItem('justsayit:locale', 'zh');
    render(<TermsOfServicePage />);
    expect(screen.getByRole('heading', { name: '服务条款' })).toBeDefined();
    expect(screen.getByText(/AI 辅助生成的记录可能出错/)).toBeDefined();
    expect(screen.queryByText(/AI-assisted entries can be wrong/)).toBeNull();
  });

  it('联系邮箱是真实地址，不是占位符', () => {
    render(<TermsOfServicePage />);
    expect(screen.getAllByText('xt263994263@gmail.com').length).toBeGreaterThan(0);
    expect(screen.queryByText(/REPLACE_WITH_REAL_CONTACT_EMAIL/)).toBeNull();
  });
});
