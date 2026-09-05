'use client';

import { useEffect } from 'react';
import { requestPersistentStorage } from '@/lib/pwa/storage';
import { initInstallPromptCapture } from '@/lib/pwa/install';

/**
 * 应用外壳级的启动副作用，不渲染任何内容：
 * 1. 申请一次持久化存储（spec §6.3）；
 * 2. 挂上 beforeinstallprompt 监听（spec §8.8）——必须在这一层，因为 Chrome
 *    只在页面生命周期很早的时候派发一次这个事件，等用户点进设置页
 *    （InstallBanner 挂载）才挂监听基本上必然错过。
 */
export function PersistStorageOnMount() {
  useEffect(() => {
    void requestPersistentStorage();
    return initInstallPromptCapture();
  }, []);
  return null;
}
