'use client';

import { useEffect, useState } from 'react';

/**
 * 反应式的网络状态，决定要不要把记账输入区整个换成"需要联网"提示
 * （离线不再支持记账——AI 结构化本来就要联网+登录，假装能排队只是把
 * "记不上"的问题延后，不是解决它，见 events.ts 里 RawInputQueuedPayload
 * 上的说明）。
 *
 * `navigator.onLine` 在"确实没有可用网络接口"时是可靠的（飞行模式、
 * 网卡拔了），这正是这个 hook 要覆盖的场景；但连着 WiFi/热点却上不了网
 * （路由器掉线、公共 WiFi 卡在认证页）时它仍然报 true——这种"看着在线
 * 其实不通"的假阳性这里防不住，得靠提交请求本身失败时的 TypeError 兜底
 * （ledger/page.tsx 的 handleSubmit、VoiceButton.tsx 的转写请求）。
 * 这个 hook 只负责"确定离线"这一半，不负责"确定在线"。
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
