import './globals.css';
import './fonts/outfit.css';
import './fonts/ibm-plex-sans.css';
import './fonts/ibm-plex-mono.css';
import './fonts/noto-sans-sc.css';
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
      </body>
    </html>
  );
}
