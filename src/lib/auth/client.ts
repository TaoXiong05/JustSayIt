'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { SessionUser } from '@/lib/server/session';
import { createEmitter } from '@/lib/emitter';

export type SessionState = {
  user: SessionUser | null;
  loading: boolean;
};

let cached: SessionState = { user: null, loading: true };
const { subscribe, emit } = createEmitter();

// 稳定引用：SSR/hydration 期间 React 会反复调用 getServerSnapshot，
// 每次都必须返回同一个对象，否则被判定为"每次渲染快照都变了"进而死循环。
const SERVER_SNAPSHOT: SessionState = { user: null, loading: true };

export function getSession(): SessionState {
  return cached;
}

/** 重新从 /api/auth/session 拉取当前用户（登录回调返回、登出后调用）。 */
export async function reloadSession(): Promise<void> {
  cached = { ...cached, loading: true };
  emit();
  try {
    const res = await fetch('/api/auth/session');
    const data = (await res.json()) as { user: SessionUser | null };
    cached = { user: data.user, loading: false };
  } catch {
    cached = { user: null, loading: false };
  }
  emit();
}

export async function fetchLogout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } finally {
    cached = { user: null, loading: false };
    emit();
  }
}

/**
 * 全局共享 session 订阅。
 * 挂载时触发一次拉取；登录/登出由页面显式调用 reloadSession / fetchLogout。
 * SSR 时返回 loading 态，避免 hydration 不匹配。
 */
export function useSession(): SessionState {
  useEffect(() => {
    if (cached.loading) void reloadSession();
  }, []);
  return useSyncExternalStore(subscribe, getSession, () => SERVER_SNAPSHOT);
}

/** 供测试/其他模块判断当前内存会话（不触发网络）。 */
export { getSession as getSessionSnapshot };