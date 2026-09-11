import type { Metadata } from 'next';

// page.tsx 在这个路由段是 'use client'（要读 useSession 判断登录态），
// 而 Next.js 只允许 Server Component 导出 metadata——所以专属的
// title/description 放在这个同级 layout.tsx 里，不动 page.tsx 本身。
export const metadata: Metadata = {
  title: 'Just say it. Your ledger stays on your device.',
  description:
    'Record expenses by voice in seconds — auto-categorized, local-first, with your device as the ledger’s primary home.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
