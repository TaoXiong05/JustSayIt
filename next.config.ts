import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 开发环境局域网多设备测试用：允许通过 nip.io 域名访问 dev server 而不被
  // Next.js 的跨域请求保护拦截（见 docs/superpowers/specs 中登录多设备测试说明）
  allowedDevOrigins: ['192.168.1.55.nip.io'],
};

/**
 * ⚠️ 构建脚本必须带 `--webpack`，别把它删掉。
 *
 * Serwist 的 `injectManifest` 是一个 **webpack** 插件——它只在 webpack 编译
 * 管线里运行，Turbopack 下不会被调用。而 Next 16 起 `next build` 默认改用
 * Turbopack，所以 package.json 的 build 脚本显式写成 `next build --webpack`。
 *
 * 移除这个 flag 不会让构建失败：构建照样成功、退出码为 0，只是
 * `public/sw.js` 从此不再被重新生成，会一直停留在上一次 webpack 构建产出的
 * 旧版本（预缓存清单里全是过期的文件指纹）。表现为 PWA 静默失去可安装性 /
 * 离线能力，且没有任何报错——所以这里留下这段注释作为唯一的守门人。
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
});

export default withSerwist(nextConfig);
