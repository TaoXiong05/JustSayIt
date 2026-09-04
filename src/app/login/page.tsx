'use client';

import { useSession } from '@/lib/auth/client';

export default function LoginPage() {
  const { user, loading } = useSession();

  if (!loading && user) {
    // 已登录：直接回主屏
    if (typeof window !== 'undefined') window.location.href = '/';
  }

  return (
    <main>
      <h1>JustSayIt</h1>
      <p>登录后即可使用 AI 记账与语音输入。</p>
      {/* 客户端不保存凭据；跳转 /api/auth/login → Google */}
      <p>
        <a href="/api/auth/login">使用 Google 登录</a>
      </p>
      <p>
        <a href="/">返回（可查看本地账本）</a>
      </p>
    </main>
  );
}