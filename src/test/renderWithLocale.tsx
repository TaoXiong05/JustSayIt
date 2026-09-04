import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@/lib/i18n/context';

/**
 * 组件测试统一入口：绝大多数组件树里都有用到 useLocale() 的节点
 * （直接或经由子组件），裸调 RTL 的 render() 会因为缺 LocaleProvider 抛错。
 * 其它一律透传 @testing-library/react 的原生导出。
 */
export function render(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(ui, { wrapper: LocaleProvider, ...options });
}

export * from '@testing-library/react';
