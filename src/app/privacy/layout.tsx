import type { Metadata } from 'next';

// 同 login/layout.tsx：page.tsx 是 'use client'，metadata 只能从
// Server Component 导出。
const TITLE = 'Privacy Policy';
const DESCRIPTION = 'How JustSayIt handles your data — what stays on your device and what does not.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
