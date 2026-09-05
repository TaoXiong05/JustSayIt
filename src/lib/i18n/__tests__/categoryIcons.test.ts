import { describe, it, expect } from 'vitest';
import { ALL_CATEGORIES } from '@/lib/ai/schema';
import { CATEGORY_ICONS } from '@/lib/i18n/categoryIcons';

// 类型层面的穷尽性由 `Record<CategoryKey, LucideIcon>` 在 tsc 时强制——
// 删掉任意一个分类的图标都会编译失败（同 CATEGORY_LABELS 的手法）。
// 这里的运行期断言只兜一层：确保映射没有多余键、也没有漏键的静默途径。
// 注意 lucide-react 1.x 把图标导出为 `{ $$typeof, render }` 对象形态
// （React 元素类型），不是函数——所以这里只断言存在性，不猜形态。
describe('CATEGORY_ICONS', () => {
  it('为每一个 CategoryKey 都提供图标', () => {
    for (const key of ALL_CATEGORIES) {
      expect(CATEGORY_ICONS[key], `分类 ${key} 缺图标`).toBeTruthy();
    }
  });

  it('图标映射的键与分类全集一一对应，不多不少', () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...ALL_CATEGORIES].sort());
  });
});