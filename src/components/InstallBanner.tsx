'use client';

import { isIOS, isStandalone } from '@/lib/platform';
import { promptInstall } from '@/lib/pwa/install';
import { useInstallPromptState } from '@/lib/pwa/useInstallPromptState';
import { useLocale } from '@/lib/i18n/context';

export function InstallBanner() {
  const { t } = useLocale();
  // mounted/installable 来自 useInstallPromptState（跟 InstallNavButton 共用
  // 同一份实现）：isIOS()/isStandalone() 只有浏览器才答得出来，服务端渲染时
  // navigator/matchMedia 不存在，直接在渲染体里调用它们会让服务端 HTML（永远
  // 走"两者都是 false"的分支）跟客户端首次渲染 HTML（真实设备上可能是
  // true）对不上，触发 hydration mismatch——mounted 在 effect 里才置 true
  // 正是为了让服务端渲染和客户端"第一次"渲染两边看到的 mounted 都是
  // false，产出完全相同的 HTML。
  const { mounted, installable } = useInstallPromptState();

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
