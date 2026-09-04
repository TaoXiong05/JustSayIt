import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LocaleProvider, useLocale } from '@/lib/i18n/context';

const STORAGE_KEY = 'justsayit:locale';

function Probe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="label">{t('submit')}</span>
      <span data-testid="count">{t('undoneCount', { count: 3 })}</span>
      <button type="button" onClick={() => setLocale('zh')}>
        to-zh
      </button>
      <button type="button" onClick={() => setLocale('en')}>
        to-en
      </button>
    </div>
  );
}

afterEach(() => {
  localStorage.clear();
});

describe('LocaleProvider / useLocale', () => {
  it('默认语言是 en（面向澳洲，不做浏览器语言自动探测）', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
    expect(screen.getByTestId('label').textContent).toBe('Submit');
  });

  it('切换语言后 t() 立即返回对应语言的文案，并写入 localStorage', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByText('to-zh'));
    expect(screen.getByTestId('locale').textContent).toBe('zh');
    expect(screen.getByTestId('label').textContent).toBe('提交');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('zh');
  });

  it('挂载时读取 localStorage 里已保存的语言选择', () => {
    localStorage.setItem(STORAGE_KEY, 'zh');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('zh');
  });

  it('localStorage 里是非法值时忽略，回退默认语言', () => {
    localStorage.setItem(STORAGE_KEY, 'fr');
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });

  it('带参数插值：undoneCount 按语言输出不同句式', () => {
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId('count').textContent).toBe('Recorded 3 items');
    fireEvent.click(screen.getByText('to-zh'));
    expect(screen.getByTestId('count').textContent).toBe('已记录 3 笔');
  });

  it('useLocale 脱离 Provider 使用时抛错', () => {
    // 抑制 React 对未捕获渲染错误的 console.error 噪音，断言本身仍然生效
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/LocaleProvider/);
    spy.mockRestore();
  });
});
