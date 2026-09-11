import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 开发环境局域网多设备测试用：允许通过 nip.io 域名访问 dev server 而不被
  // Next.js 的跨域请求保护拦截（见 docs/superpowers/specs 中登录多设备测试说明）
  // EN: For LAN multi-device testing in dev — allows accessing the dev server via
  // a nip.io hostname without Next.js's cross-origin request protection blocking it.
  allowedDevOrigins: ['192.168.1.55.nip.io'],
};

/**
 * ⚠️ build 和 dev 脚本都必须带 `--webpack`，别把它删掉。
 *
 * Serwist 的 `injectManifest` 是一个 **webpack** 插件——它只在 webpack 编译
 * 管线里运行，Turbopack 下不会被调用。而 Next 16 起 `next build`/`next dev`
 * 默认改用 Turbopack，所以 package.json 里两个脚本都显式写成 `--webpack`。
 *
 * build 脚本上移除这个 flag 不会让构建失败：构建照样成功、退出码为 0，只是
 * `public/sw.js` 从此不再被重新生成，会一直停留在上一次 webpack 构建产出的
 * 旧版本（预缓存清单里全是过期的文件指纹）。表现为 PWA 静默失去可安装性 /
 * 离线能力，且没有任何报错。
 *
 * dev 脚本上移除这个 flag 则会直接报错退出：Next 16 检测到 next.config.ts
 * 解析出的配置里带了 webpack 字段（withSerwistInit 注入的），但当前跑的是
 * Turbopack，会拒绝启动并提示要么删掉 webpack 配置、要么显式选择
 * `--webpack`/`--turbopack`。
 *
 * EN: Both the `build` and `dev` scripts must keep the `--webpack` flag — do not
 * remove it.
 *
 * Serwist's `injectManifest` is a **webpack** plugin — it only runs inside the
 * webpack compilation pipeline, never under Turbopack. Since Next 16, `next build`
 * and `next dev` default to Turbopack, so both scripts in package.json pin
 * `--webpack` explicitly.
 *
 * Removing the flag from `build` won't fail the build: it still succeeds with
 * exit code 0, but `public/sw.js` simply stops being regenerated and stays frozen
 * at whatever the last webpack build produced (a precache manifest full of stale
 * file hashes). Symptom: the PWA silently loses installability/offline support,
 * with no error anywhere.
 *
 * Removing the flag from `dev` fails fast instead: Next 16 detects a `webpack`
 * field in the resolved next.config.ts (injected by withSerwistInit) while
 * Turbopack is running, and refuses to start — telling you to either drop the
 * webpack config or explicitly pick `--webpack`/`--turbopack`.
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
});

export default withSerwist(nextConfig);
