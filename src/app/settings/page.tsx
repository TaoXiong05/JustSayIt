'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useSession, fetchLogout } from '@/lib/auth/client';
import { getStorageEstimate } from '@/lib/pwa/storage';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';
import { InstallBanner } from '@/components/InstallBanner';
import { PageLoading } from '@/components/PageLoading';

/** 四张卡片（账号/存储/数据/PWA）统一走这个壳，宽度和视觉权重才不会各自漂移。 */
function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-card">
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const [usage, setUsage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);

  // 点击后没有任何可见反馈——账号那行邮箱悄悄消失很容易被忽略，用户会以为
  // 按钮没反应。退回 /ledger 而不是 /login：本地账本按 §11.4 登出后仍可见，
  // /ledger 本身已经有"未登录"态（输入区替换成登录引导），比把人送到营销
  // 首页更符合"退出后还能看自己本地数据"的既有设计。根路径 / 现在是按
  // 登录态分流的路由页（见 app/page.tsx），不能直接跳那儿——刚登出的这一刻
  // useSession 缓存可能还没来得及更新，跳 / 有极小概率被当成"已登录"弹回
  // /ledger（殊途同归但多一次无意义的跳转），不如直接给终点。用
  // window.location 而不是 next/navigation 的 useRouter——后者需要 App
  // Router context，组件测试里没有挂载真实路由树会直接抛 invariant；
  // login/page.tsx 的既有跳转就是这个写法，这里保持一致。
  async function handleLogout(): Promise<void> {
    await fetchLogout();
    if (typeof window !== 'undefined') window.location.href = '/ledger';
  }

  useEffect(() => {
    void getStorageEstimate().then(setUsage);
  }, []);

  const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
  // 分母是 0（极少见的浏览器怪响应）时不要 NaN%——夹在 [0,100] 内，UI 上
  // 一条空/满的进度条总比一条宽度是 NaN 的进度条安全。
  const usagePct =
    usage && usage.quotaBytes > 0
      ? Math.min(100, Math.max(0, (usage.usageBytes / usage.quotaBytes) * 100))
      : 0;

  // session 待定期间账号那一行是空的（user 还是 null），先别画整个页面
  // （用户明确要求：页面加载时不展示未确定内容，统一换成标准过渡动画）。
  if (loading) return <PageLoading />;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:max-w-2xl lg:px-8 lg:pb-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">{t('settingsTitle')}</h1>
      </header>

      <div className="flex flex-col gap-4">
        <SettingsCard>
          <h2 className="font-display text-sm font-semibold text-ink">{t('settingsAccount')}</h2>
          <div className="mt-2 flex items-center justify-between gap-3">
            {user && (
              <p className="min-w-0 truncate text-sm text-muted">{user.email ?? user.googleSub}</p>
            )}
            {/* 次要动作用轮廓+悬停才显色，不跟 Export/Install 的实心品牌色按钮
                抢视觉权重——"退出"不该长得比"导出备份"更抓眼球。 */}
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:border-danger-soft hover:bg-danger-soft"
            >
              {t('logOut')}
            </button>
          </div>
        </SettingsCard>

        {usage && (
          <SettingsCard>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-sm font-semibold text-ink">
                {t('settingsStorageTitle')}
              </h2>
              <span className="font-mono text-xs tabular-nums text-muted">
                {t('settingsStorageUsage', {
                  used: toMb(usage.usageBytes),
                  quota: toMb(usage.quotaBytes),
                })}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={t('settingsStorageTitle')}
              aria-valuenow={Math.round(usagePct)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width]"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </SettingsCard>
        )}

        <SettingsCard>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold text-ink">{t('settingsDataTitle')}</h2>
            <button
              type="button"
              onClick={() => void exportBackup()}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink transition-colors hover:opacity-90"
            >
              <Download aria-hidden="true" className="size-4" />
              {t('settingsExport')}
            </button>
          </div>
        </SettingsCard>

        <InstallBanner />
      </div>
    </main>
  );
}
