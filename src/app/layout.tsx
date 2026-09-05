import './globals.css';
import { Outfit, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { LocaleProvider } from '@/lib/i18n/context';
import { Toaster } from '@/components/Toaster';
import { TopNav } from '@/components/TopNav';
import { MobileHeader } from '@/components/MobileHeader';
import { BottomNav } from '@/components/BottomNav';
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

export const metadata = {
  title: 'JustSayIt',
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${bodyFont.variable} ${mono.variable}`}>
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
          <Toaster />
          <BottomNav />
        </LocaleProvider>
      </body>
    </html>
  );
}
