import './globals.css';
import { Outfit, IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_SC } from 'next/font/google';
import { LocaleProvider } from '@/lib/i18n/context';
import { TopNav } from '@/components/TopNav';
import { MobileHeader } from '@/components/MobileHeader';
import { BottomNav } from '@/components/BottomNav';
import { Footer } from '@/components/Footer';
import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';

// Plan 5 字体体系：display=Outfit、body=IBM Plex Sans、numerals=IBM Plex Mono。
// 变量名与 @theme token（--font-display/body/mono）区分开，避免 CSS 自引用循环
// （见 globals.css @theme 注释）。实际字体族名通过这些 variable 暴露在 <html> 上。
const display = Outfit({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

// 中文兜底字体——Outfit/IBM Plex 都不带 CJK 字形，之前中文一律静默降级到
// 系统默认无衬线（等于中文用户完全看不到这套字体体系的个性）。Noto Sans SC
// 跟 Outfit 同属几何/人文无衬线，粗细节奏接近，插进 display/body 栈的第二位——
// 按字符找字形：Outfit 没有的汉字字形交给它，不影响拉丁字符仍然用 Outfit。
const cjk = Noto_Sans_SC({
  // next/font/google 对 CJK 字体不支持按 subset 精简下载（它的 subsets
  // 选项只有 cyrillic/latin/latin-ext/vietnamese，没有 chinese-simplified）——
  // 中文字形本来就大，这是嵌入自定义中文字体躲不开的体积代价。
  // preload 依赖能声明的 subset 才能生效，这里没有可声明的中文 subset，
  // 只能关掉 preload（跟 next.js 官方文档对非拉丁 Google 字体的建议一致），
  // display:'swap' 已经保证不会阻塞首屏文字渲染。
  weight: ['500', '700', '900'],
  variable: '--font-noto-sc',
  display: 'swap',
  preload: false,
});

export const metadata = {
  title: 'JustSayIt',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${bodyFont.variable} ${mono.variable} ${cjk.variable}`}
    >
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
