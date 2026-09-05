import './globals.css';
import { LocaleProvider } from '@/lib/i18n/context';
import { BottomNav } from '@/components/BottomNav';
import { PersistStorageOnMount } from '@/components/PersistStorageOnMount';

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
          {children}
          <BottomNav />
        </LocaleProvider>
      </body>
    </html>
  );
}
