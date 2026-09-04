import './globals.css';
import { LocaleProvider } from '@/lib/i18n/context';

export const metadata = { title: 'JustSayIt' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
