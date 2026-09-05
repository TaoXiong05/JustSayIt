'use client';

import { useEffect, useState } from 'react';
import { isIOS, isStandalone } from '@/lib/platform';
import { canPromptInstall, promptInstall } from '@/lib/pwa/install';
import { useLocale } from '@/lib/i18n/context';

export function InstallBanner() {
  const { t } = useLocale();
  // isIOS()/isStandalone()/canPromptInstall() 只有浏览器才答得出来——服务端
  // 渲染时 navigator/window/matchMedia 不存在，直接在渲染体里调用它们会让
  // 服务端 HTML（永远走"两者都是 false"的分支）跟客户端首次渲染 HTML
  // （真实设备上可能是 true）对不上，触发 hydration mismatch（这次报错的
  // 根因）。标准解法：mounted 在 effect 里才置 true——effect 只在客户端
  // hydration 完成之后跑，所以服务端渲染和客户端"第一次"渲染两边看到的
  // mounted 都是 false，产出完全相同的 HTML；等 mounted 变 true 触发的
  // 这次重渲染，才是纯客户端的、可以放心调用这些 API 的一次渲染。
  const [mounted, setMounted] = useState(false);
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    setMounted(true);
    setInstallable(canPromptInstall());
    // 事件的捕获在应用外壳层（PersistStorageOnMount）就已经挂好了——Chrome
    // 只在页面早期派发一次 beforeinstallprompt，等到用户点进设置页才挂监听
    // 就晚了。这里只读结果：轮询一次挂载后的状态即可，这个横幅本身不是高频
    // 重渲染的组件，用 useSyncExternalStore 属于过度设计。
    const id = setInterval(() => setInstallable(canPromptInstall()), 500);
    return () => clearInterval(id);
  }, []);

  // 卡片外壳跟 settings/page.tsx 的 SettingsCard 保持完全一致（rounded-xl +
  // p-5），不是各自维护一份相近但不同的圆角/内边距——不然设置页里这四张卡片
  // 挨在一起看，这一张会很显眼地"差一点"。
  if (mounted && isStandalone()) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <p className="text-sm text-muted">{t('installAlreadyInstalled')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-sm font-semibold text-ink">{t('installTitle')}</p>
        {mounted && !isIOS() && installable && (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="inline-flex shrink-0 items-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
          >
            {t('installActionAndroid')}
          </button>
        )}
      </div>
      {mounted && isIOS() && (
        <p className="mt-2 text-sm text-muted">{t('installInstructionsIOS')}</p>
      )}
    </div>
  );
}
