import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom 不评估样式表里的 @media (prefers-color-scheme: dark)，无法靠
// 计算样式验证暗色分支（计划 Task 1 测试项里已预告这条路走不通）。
// 改对 globals.css 源文本做机械校验：亮暗两个 token 块键集完全对齐、
// 计划绑定的品牌/语义 hex 精确匹配、且没有手动开关的分支。
const css = readFileSync(resolve(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');

/** 取出 selector 的开括号到匹配闭括号之间的内容。 */
function blockOf(cssText: string, selector: string): string {
  const start = cssText.indexOf(selector);
  if (start === -1) throw new Error(`找不到选择器 ${selector}`);
  const open = cssText.indexOf('{', start);
  if (open === -1) throw new Error(`${selector} 没有开括号`);
  let depth = 0;
  let i = open;
  for (; i < cssText.length; i++) {
    if (cssText[i] === '{') depth++;
    else if (cssText[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return cssText.slice(open + 1, i);
}

/** 提取块内的 `--name: value;` 键值对。 */
function customProps(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

const light = customProps(blockOf(css, ':root {'));
let dark: Map<string, string> | null = null;
// 暗色守卫块：@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }
const mediaStart = css.indexOf('@media (prefers-color-scheme: dark)');
if (mediaStart !== -1) {
  const guardStart = css.indexOf(':root:not([data-theme="light"]) {', mediaStart);
  if (guardStart !== -1) {
    const open = css.indexOf('{', guardStart);
    let depth = 0;
    let i = open;
    for (; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    dark = customProps(css.slice(open + 1, i));
  }
}

describe('设计 token（globals.css）', () => {
  it('亮色块定义了完整令牌集', () => {
    for (const name of [
      '--bg',
      '--surface',
      '--surface-2',
      '--ink',
      '--muted',
      '--border',
      '--brand',
      '--brand-2',
      '--brand-soft',
      '--brand-ink',
      '--income',
      '--income-soft',
      '--expense',
      '--expense-soft',
      '--warning',
      '--warning-soft',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--shadow-card',
      '--shadow-pop',
    ]) {
      expect(light.has(name), `${name} 应在 :root 中定义`).toBe(true);
    }
  });

  it('暗色块重定义了全部亮色令牌——不存在只在亮色里定义的元素', () => {
    expect(dark, '应存在 @media (prefers-color-scheme: dark) 守卫块').not.toBeNull();
    for (const [name] of light) {
      expect(dark!.has(name), `${name} 应在暗色块中重定义`).toBe(true);
    }
  });

  it('暗色块没有新增亮色块没有的令牌', () => {
    expect(dark).not.toBeNull();
    for (const [name] of dark!) {
      expect(light.has(name), `${name} 不应只在暗色块出现`).toBe(true);
    }
  });

  it('品牌与语义色的绑定值精确匹配计划声明', () => {
    expect(light.get('--brand')).toBe('#4f46e5');
    expect(light.get('--brand-2')).toBe('#8b5cf6');
    expect(light.get('--income')).toBe('#0e9f6e');
    expect(light.get('--expense')).toBe('#e0463b');
    expect(dark!.get('--income')).toBe('#35d399');
    expect(dark!.get('--expense')).toBe('#fb7b71');
    // 品牌在暗色下仍与 income/expense 语义色不同——三者对比可区分
    expect(dark!.get('--brand')).not.toBe(dark!.get('--income'));
    expect(dark!.get('--brand')).not.toBe(dark!.get('--expense'));
  });

  it('没有 data-theme="dark" 手动开关分支（Global Constraint 3）', () => {
    // data-theme="light" 守卫是允许的（三态契约）；"dark" 分支禁止。
    expect(css.includes('data-theme="dark"')).toBe(false);
  });

  it('映射进 @theme 的每个 token 都引用了真实存在的变量', () => {
    const theme = blockOf(css, '@theme {');
    // next/font 的 variable 选项在 <html> 上运行时注入，不属于 :root 令牌集
    const fontVars = new Set([
      '--font-outfit',
      '--font-plex-sans',
      '--font-plex-mono',
      '--font-noto-sc',
    ]);
    for (const m of theme.matchAll(/var\((--[\w-]+)\)/g)) {
      const ok = light.has(m[1]) || fontVars.has(m[1]);
      expect(ok, `${m[1]} 应已在 :root 定义或由 next/font 注入`).toBe(true);
    }
  });
});