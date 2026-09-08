import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/renderWithLocale';
import { Hero } from '@/components/marketing/Hero';
import { CaptureDemo } from '@/components/marketing/CaptureDemo';
import { StatStrip } from '@/components/marketing/StatStrip';
import { FeatureGrid } from '@/components/marketing/FeatureGrid';

// 每个营销段都能脱离整页独立渲染——证明「可裁剪/重排」是结构事实，而非组装巧合。
describe('营销段 · 独立渲染', () => {
  it('Hero 独立渲染：标题、副标题、双 CTA（登录直达 /api/auth/login）', () => {
    render(<Hero />);
    expect(screen.getByText(/Just say it\. Your ledger stays on your device/)).toBeDefined();
    expect(screen.getByText(/Record expenses by voice/)).toBeDefined();
    expect(screen.getByText(/Where your data goes/)).toBeDefined();
    expect(screen.getByText(/Optional sync to your own Google Drive/)).toBeDefined();
    const primary = screen.getByRole('link', { name: 'Continue with Google' });
    expect(primary).toHaveProperty('href', 'http://localhost:3000/api/auth/login');
    const secondary = screen.getByRole('link', { name: 'See how it works' });
    expect(secondary).toHaveProperty('href', 'http://localhost:3000/#features');
  });

  it('CaptureDemo 独立渲染：静态 mockup 行（装饰性，不接 STT）', () => {
    render(<CaptureDemo />);
    // 转写气泡与分类行都含 Coles——分别用各自完整文本断言
    expect(screen.getByText(/“Coles 28\.45”/)).toBeDefined();
    expect(screen.getByText('Coles')).toBeDefined();
    expect(screen.getByText('Uber')).toBeDefined();
    // 整段对无障碍树隐藏——营销装饰不该影响 AT。方向 #4 把 CaptureDemo
    // 并入 Hero 之后，它自己不再是独立的 <section>（外层交给 Hero 统一
    // 布局），aria-hidden 直接标在它自己的最外层容器上。
    expect(screen.getByText('Coles').closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('StatStrip 独立渲染：三组数字 + 标签', () => {
    render(<StatStrip />);
    expect(screen.getByText('<3s')).toBeDefined();
    expect(screen.getByText('LOCAL')).toBeDefined();
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.getByText(/from voice to record/)).toBeDefined();
    expect(screen.getByText(/primary ledger copy on your device/)).toBeDefined();
    expect(screen.getByText(/copies held on our servers/)).toBeDefined();
  });

  it('FeatureGrid 独立渲染：4 张能力卡 + 锚点 id="features"', () => {
    render(<FeatureGrid />);
    expect(screen.getByRole('heading', { name: 'Voice-first input' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Smart categorization' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Works offline' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Local-first & private' })).toBeDefined();
    expect(screen.getByText(/Tap once, say it/)).toBeDefined();
    expect(screen.getByText(/AI sorts every entry/)).toBeDefined();
    expect(screen.getByText(/Entries queue up and sync/)).toBeDefined();
    expect(screen.getByText(/cloud is just backup/)).toBeDefined();
  });
});