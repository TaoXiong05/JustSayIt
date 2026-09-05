'use client';

import { useEffect, useState } from 'react';
import { useSession, fetchLogout } from '@/lib/auth/client';
import { getStorageEstimate } from '@/lib/pwa/storage';
import { exportBackup } from '@/lib/sync/export';
import { useLocale } from '@/lib/i18n/context';
import { InstallBanner } from '@/components/InstallBanner';

export default function SettingsPage() {
  const { user, loading } = useSession();
  const { t } = useLocale();
  const [usage, setUsage] = useState<{ usageBytes: number; quotaBytes: number } | null>(null);

  useEffect(() => {
    void getStorageEstimate().then(setUsage);
  }, []);

  const toMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-6 lg:pb-6">
      <h1 className="font-display text-xl font-bold text-ink">{t('settingsTitle')}</h1>
      <section className="mt-4 rounded-lg border border-border bg-surface p-4 shadow-card">
        <h2 className="font-display text-sm font-semibold text-ink">{t('settingsAccount')}</h2>
        {user && <p className="mt-1 text-sm text-muted">{user.email ?? user.googleSub}</p>}
        <button
          type="button"
          onClick={() => void fetchLogout()}
          disabled={loading}
          className="mt-3 rounded border border-danger-soft bg-danger-soft px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:opacity-80 disabled:opacity-50"
        >
          {t('logOut')}
        </button>
      </section>
      {usage && (
        <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-sm text-muted shadow-card">
          {t('settingsStorageUsage', { used: toMb(usage.usageBytes), quota: toMb(usage.quotaBytes) })}
        </p>
      )}
      <button
        type="button"
        onClick={() => void exportBackup()}
        className="mt-3 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-card transition-colors hover:opacity-90"
      >
        {t('settingsExport')}
      </button>
      <div className="mt-4">
        <InstallBanner />
      </div>
    </main>
  );
}
