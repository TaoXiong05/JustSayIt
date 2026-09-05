import { beforeAll, describe, it, expect } from 'vitest';
import type { RuntimeCaching } from 'serwist';

/**
 * spec §13.4 硬性规则：Service Worker 绝不能缓存 /api/* 下的任何响应
 * ——项目已有基于 IndexedDB 的离线数据层，SW 如果再缓存 API 响应就会
 * 产生第二个互相打架的真相来源。
 *
 * 调查发现：@serwist/next（本项目安装的版本 9.5.12）导出的 `defaultCache`
 * 实际上包含一条会缓存 /api/* GET 响应的运行时规则（NetworkFirst，
 * cacheName: "apis"，见 node_modules/@serwist/next/src/index.worker.ts），
 * 并不像常见印象/文档标题暗示的那样"默认已排除 /api/*"。因此本项目没有
 * 使用 defaultCache，而是让 runtimeCaching 保持为空数组：只预缓存构建期
 * 生成的应用外壳（precacheEntries），其余一切请求（包括所有 /api/*
 * 请求）都直接走网络、不经过任何缓存规则。
 */
describe('Service Worker runtimeCaching 规则（spec §13.4 硬性规则）', () => {
  let runtimeCaching: RuntimeCaching[];

  beforeAll(async () => {
    // sw.ts 在模块顶层会执行 `new Serwist({ skipWaiting: true, ... })`。这一行
    // 在真正的 Service Worker 全局作用域里没问题（self.skipWaiting 是浏览器
    // 原生提供的 API），但 vitest 用的 jsdom 环境并不模拟 Service Worker 全局
    // 作用域，没有这个方法，会在 import 时直接抛错。这里补一个最小 stub，
    // 只是为了让模块能被正常 import 从而拿到 runtimeCaching 这个纯数据常量，
    // 不影响下面对它的断言。
    (globalThis as unknown as { skipWaiting?: () => void }).skipWaiting = () => {};
    ({ runtimeCaching } = await import('@/app/sw'));
  });

  it('为空数组：只预缓存应用外壳，不设置任何运行时缓存规则', () => {
    expect(runtimeCaching).toEqual([]);
  });

  it('不包含任何匹配 /api/ 路径的缓存规则（即便未来往里加规则，这条测试也兜底）', () => {
    for (const rule of runtimeCaching) {
      const matcher = rule.matcher;
      if (typeof matcher === 'function') {
        // 函数形式的 matcher 无法从静态字符串检查，用一个指向 /api/ 的示例请求
        // 实际调用它，确认它不会认领 /api/* 路径。
        const fakeUrl = new URL('https://example.com/api/expenses');
        const matched = matcher({
          url: fakeUrl,
          sameOrigin: true,
          request: new Request(fakeUrl),
        } as Parameters<typeof matcher>[0]);
        expect(matched).toBeFalsy();
        continue;
      }
      const pattern = matcher instanceof RegExp ? matcher.source : String(matcher);
      expect(pattern).not.toMatch(/\/api\//);
    }
  });
});
