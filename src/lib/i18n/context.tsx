'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  DEFAULT_LOCALE,
  dictionaries,
  type DictKey,
  type Locale,
} from '@/lib/i18n/dictionary';

const STORAGE_KEY = 'justsayit:locale';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: DictKey, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === 'en' || raw === 'zh' ? raw : null;
  } catch {
    // 隐私模式/存储被禁用等——静默回退到默认语言，不影响功能
    return null;
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // 首屏（含 SSR）先用默认语言，挂载后如有本地存过的选择再切换，
  // 避免 hydration 不匹配（同 useSession 的处理方式）
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // 存不下就存不下，本次会话内的切换仍然生效
    }
  }, []);

  const t = useCallback(
    (key: DictKey, params?: Record<string, string | number>): string => {
      const entry = dictionaries[locale][key];
      return typeof entry === 'function' ? entry(params ?? {}) : entry;
    },
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale 必须在 LocaleProvider 内使用');
  return ctx;
}
