'use client';

import { useEffect } from 'react';
import { requestPersistentStorage } from '@/lib/pwa/storage';
import { initInstallPromptCapture } from '@/lib/pwa/install';
import { initSync } from '@/lib/sync/init';
import { useSession } from '@/lib/auth/client';

/**
 * 应用外壳级的启动副作用，不渲染任何内容：
 * 1. 申请一次持久化存储（spec §6.3）；
 * 2. 挂上 beforeinstallprompt 监听（spec §8.8）——必须在这一层，因为 Chrome
 *    只在页面生命周期很早的时候派发一次这个事件，等用户点进设置页
 *    （InstallBanner 挂载）才挂监听基本上必然错过。
 * 3. 登录后启动同步（spec §7）——挂在这里而不是 ledger/page.tsx，因为账本
 *    不是唯一会被访问的页面：一个已登录用户如果全程只停留在 /history、
 *    /stats 或 /settings（书签/分享链接直接进，不路过 /ledger），旧写法
 *    整个会话都不会同步。initSync() 内部完全不判断登录态、哨兵轮询失败
 *    也不会自己停下来（见 lib/sync/init.ts 的 pollVersionOnce），所以不能
 *    无条件跑在这一层——游客访问任何页面都会变成每 10s 打一次注定 401 的
 *    /api/sync-version、永不停止。这里用 authed 门控：登录后才启动，
 *    登出（authed 变回 false）时 effect 自己 cleanup 停掉。
 */
export function PersistStorageOnMount() {
  const { user, loading } = useSession();
  const authed = !loading && user != null;

  useEffect(() => {
    void requestPersistentStorage();
    return initInstallPromptCapture();
  }, []);

  useEffect(() => {
    if (!authed) return;
    return initSync();
  }, [authed]);

  return null;
}
