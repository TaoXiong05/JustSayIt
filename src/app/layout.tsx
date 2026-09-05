import './globals.css';
import { Outfit, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import { LocaleProvider } from '@/lib/i18n/context';
import { Toaster } from '@/components/Toaster';
import { SidebarNav } from '@/components/SidebarNav';
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
          {/* 桌面端侧边导航占左 224px，内容区整体右移（Task 15，真·桌面布局） */}
          <SidebarNav />
          <div className="lg:pl-56">
            {children}
            <Toaster />
          </div>
          <BottomNav />
        </LocaleProvider>
      </body>
    </html>
  );
}
