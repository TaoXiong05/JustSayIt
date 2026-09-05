'use client';

import { useEffect } from 'react';
import { requestPersistentStorage } from '@/lib/pwa/storage';

/** 应用启动时申请一次持久化存储（spec §6.3），不渲染任何内容。 */
export function PersistStorageOnMount() {
  useEffect(() => {
    void requestPersistentStorage();
  }, []);
  return null;
}
