'use client';

import { useEffect } from 'react';
import { useSession } from '@/lib/auth/client';
import { PageLoading } from '@/components/PageLoading';

/**
 * 根路径不再是 Ledger 页面本身——Ledger 挪到了 /ledger（见
 * src/app/ledger/page.tsx）。这里只做一件事：按登录状态把访问
 * localhost:3000 的人分流到 /login（未登录）或 /ledger（已登录）。
 *
 * 用 window.location 而不是 next/navigation 的 useRouter/redirect——
 * 项目里已有的先例（login/page.tsx、settings/page.tsx 的登出跳转）都是
 * 这个写法：useRouter 需要真实挂载的 App Router context，组件测试里
 * 直接调用会抛 "invariant expected app router to be mounted"；Server
 * Component 里的 redirect() 则是靠抛一个特殊异常中断渲染，脱离 Next
 * 自己的请求生命周期（比如这里用 Vitest+RTL 直接渲染）会变成一个未被
 * 捕获的异常而不是一次跳转。window.location.href 在两种环境下都能预期
 * 工作，测试里只需要断言这个值被正确设置。
 */
export default function RootRedirect() {
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading) window.location.href = user ? '/ledger' : '/login';
  }, [loading, user]);

  return <PageLoading />;
}
