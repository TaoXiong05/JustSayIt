import type { Metadata } from 'next';

// 同 login/layout.tsx：page.tsx 是 'use client'，metadata 只能从
// Server Component 导出。
const TITLE = 'Terms of Service';
const DESCRIPTION = 'The terms governing use of JustSayIt.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
