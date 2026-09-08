import './globals.css';
import './fonts/outfit.css';
import './fonts/ibm-plex-sans.css';
import './fonts/ibm-plex-mono.css';
import './fonts/noto-sans-sc.css';
import { SerwistProvider } from '@serwist/next/react';
import { LocaleProvider } from '@/lib/i18n/context';
import { TopNav } from '@/components/TopNav';
import { MobileHeader } from '@/components/MobileHeader';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';

// Plan 5 字体体系：display=Outfit、body=IBM Plex Sans、numerals=IBM Plex Mono、
// CJK 兜底=Noto Sans SC。全部四套字体都走自托管的原生 @font-face（./fonts/*.css
// + public/fonts/*/），不再用 next/font/google——后者在 Docker build 阶段要连
// fonts.gstatic.com 下载字重文件，Oracle VM 的构建环境对它偶发 ETIMEDOUT/
// ENETUNREACH，build 直接失败（Noto Sans SC 先出的问题，但 Outfit/IBM Plex
// 只是体积小、命中率低，属于同一类风险，一并挪了）。
//
// Outfit/IBM Plex 是从 Google Fonts CSS2 API 抓下来的、按 `/* latin */` 注释
// 过滤出的纯拉丁子集文件（匹配原来 subsets:['latin'] 的行为，不带 latin-ext/
// cyrillic/greek/vietnamese），每个字重一个文件。Noto Sans SC 保留了 303 个
// 按 unicode-range 切分的文件（体积大，见该 css 文件顶部注释）。
//
// --font-outfit/--font-plex-sans/--font-plex-mono/--font-noto-sc 这几个
// @theme 用到的变量因此都改在 globals.css 的 :root 里手写声明字体族名，
// 不再由 next/font 自动生成 class + inline style。

export const metadata = {
  title: 'JustSayIt',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* next.config.ts 的 withSerwistInit 只负责在构建期把 src/app/sw.ts
            编译成 public/sw.js——它不会让浏览器去装这个文件。真正的
            `navigator.serviceWorker.register()` 调用由这个 Provider 发起，
            少了它 sw.js 会被正确生成、却永远没有任何一个标签页安装它，
            SW 也就永远不会进入 activated 状态去接管导航请求。后果是离线时
            spec §13.4 承诺的"外壳 HTML 回退到缓存"完全不生效——不是某个
            页面加载失败，是整个应用连壳都起不来（用户反馈：离线后页面
            都加载不了）。
            reloadOnOnline 关掉：默认值为 true，会在浏览器重新联网时对整个
            页面做一次 location.reload()——这个应用的核心场景就是"网络时有
            时无也要能记账"，断线又恢复的那一刻用户很可能正在 Composer 里
            打字或录音，一次没有任何提示的强制刷新会直接冲掉这段还没提交
            的草稿，比"暂时联不上网"本身更糟。 */}
        <SerwistProvider swUrl="/sw.js" reloadOnOnline={false}>
          <LocaleProvider>
            <PersistStorageOnMount />
            {/* 桌面端从侧边栏改成顶部导航条（用户明确要求去掉侧边栏），内容区
                不再需要永久左边距——各页面自己的 max-w-* + mx-auto 负责居中。
                移动端保持底部 tab 栏不变（用户自己选的，没跟着改成汉堡菜单），
                但另外加一条全局页眉（品牌 logo + 同步/语言/头像，不含导航——
                导航交给底部 tab）：以前这几样只长在主屏自己的 header 里，
                历史/统计/设置页在移动端够不到语言切换和设置入口。TopNav/
                MobileHeader 互斥，同一时刻只有一个按断点显示。 */}
            <TopNav />
            <MobileHeader />
            {children}
            <Footer />
            <BottomNav />
          </LocaleProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
