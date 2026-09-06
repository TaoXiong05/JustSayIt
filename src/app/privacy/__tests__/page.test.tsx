import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import PrivacyPolicyPage from '@/app/privacy/page';

describe('隐私政策页（跟随当前 UI 语言，不同时显示两种）', () => {
  beforeEach(() => localStorage.clear());

  it('默认（英文）只显示英文正文，不显示中文正文', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeDefined();
    expect(screen.getByText(/Your ledger data never touches our servers/)).toBeDefined();
    expect(screen.queryByText(/您的账本数据从不经过我们的服务器/)).toBeNull();
  });

  it('切到中文后只显示中文正文，不显示英文正文', () => {
    localStorage.setItem('justsayit:locale', 'zh');
    render(<PrivacyPolicyPage />);
    expect(screen.getByRole('heading', { name: '隐私政策' })).toBeDefined();
    expect(screen.getByText(/您的账本数据从不经过我们的服务器/)).toBeDefined();
    expect(screen.queryByText(/Your ledger data never touches our servers/)).toBeNull();
  });

  it('联系邮箱是真实地址，不是占位符', () => {
    render(<PrivacyPolicyPage />);
    expect(screen.getAllByText('xt263994263@gmail.com').length).toBeGreaterThan(0);
    expect(screen.queryByText(/REPLACE_WITH_REAL_CONTACT_EMAIL/)).toBeNull();
  });
});
