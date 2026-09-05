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
    <main>
      <h1>{t('settingsTitle')}</h1>
      <section>
        <h2>{t('settingsAccount')}</h2>
        {user && <p>{user.email ?? user.googleSub}</p>}
        <button type="button" onClick={() => void fetchLogout()} disabled={loading}>
          {t('logOut')}
        </button>
      </section>
      {usage && (
        <p>{t('settingsStorageUsage', { used: toMb(usage.usageBytes), quota: toMb(usage.quotaBytes) })}</p>
      )}
      <button type="button" onClick={() => void exportBackup()}>
        {t('settingsExport')}
      </button>
      <InstallBanner />
    </main>
  );
}
