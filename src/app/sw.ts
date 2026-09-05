import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from 'serwist';
import { NetworkFirst, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

// 注：本项目根 tsconfig.json 的 lib 里只有 "dom"，没有 "webworker"（同时加两者
// 会因为二者对 `self` 等全局名的类型定义互相冲突而报错）。所以这里不用需要
// webworker lib 才认得的 `ServiceWorkerGlobalScope` 类型，改用 dom lib 本身
// 就有的 `WorkerGlobalScope`（上面已经给它扩展了 __SW_MANIFEST 字段），
// 只声明这个文件实际用到的那部分类型信息，避免引入 lib 冲突。
declare const self: WorkerGlobalScope;

/**
 * 只缓存应用外壳，绝不缓存任何 API 响应或账本数据（spec §13.4 硬性规则）。
 *
 * 调查发现：`@serwist/next`（本项目安装版本 9.5.12）导出的 `defaultCache`
 * 并不像常见印象那样"默认已排除 /api/*"——它实际包含一条运行时规则会用
 * NetworkFirst 缓存 /api/* 的 GET 响应（cacheName: "apis"，见
 * node_modules/@serwist/next/src/index.worker.ts 第 191-205 行），这与本
 * 项目"SW 绝不能缓存 API 响应"的硬性规则冲突（项目已有基于 IndexedDB 的
 * 离线数据层，SW 再缓存 API 响应会产生第二个互相打架的真相来源）。
 *
 * 因此这里不使用 defaultCache，而是手写唯一一条运行时规则：
 * 同源 + 仅导航请求（request.mode === 'navigate'）+ 显式排除 /api/*，
 * 策略为 NetworkFirst（先走网络，失败时回退到缓存里的外壳 HTML）。
 * 这正是 spec §13.4 要求的三件事里的第二件——"导航请求 network-first
 * 回退到缓存的外壳"；没有它，已安装的 PWA 离线时连外壳 HTML 都加载不出来。
 *
 * 除导航请求外的一切请求——尤其是所有 /api/* 请求——都不会被任何运行时
 * 缓存规则拦截，直接走浏览器原生网络请求（数据的离线能力由 IndexedDB
 * 事件日志 + 离线队列负责，SW 绝不碰）。
 *
 * sw.test.ts 对这个数组做了双重断言（这条导航规则存在且行为正确、且数组里
 * 任何一条规则都不能匹配 /api/），不只靠"读一遍文档相信它"。
 */
export const runtimeCaching: RuntimeCaching[] = [
  {
    matcher: ({ request, url, sameOrigin }) =>
      sameOrigin && request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
    handler: new NetworkFirst({ cacheName: 'pages' }),
  },
];

export const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();
