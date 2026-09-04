import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // 开发环境局域网多设备测试用：允许通过 nip.io 域名访问 dev server 而不被
  // Next.js 的跨域请求保护拦截（见 docs/superpowers/specs 中登录多设备测试说明）
  allowedDevOrigins: ['192.168.1.55.nip.io'],
};

export default nextConfig;
