import type { Locale } from '@/lib/i18n/dictionary';

/**
 * Transaction.date（YYYY-MM-DD）→ 本地化的日期标题，如 "Sun, Sep 7" / "9月7日周日"。
 *
 * 提到共享模块而不是各页面各写一份：原来只有 History 页有这个函数，首页的
 * LedgerList 直接把 `2026-09-07` 这串原始日期渲染出来了（同一个列表在两个
 * 页面长得不一样，是明摆着的 bug）。两处共用一个实现，日期格式以后也不会走散。
 *
 * 中午 12 点构造 Date：只给年月日的话拿到的是 UTC 午夜，在 UTC 以西的时区
 * （美洲）会被格式化成前一天。正午离两边的边界都有 12 小时余量，任何时区
 * 都不会跨日。
 */
export function formatDayHeader(dateStr: string, locale: Locale): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date(y, m - 1, d, 12));
}
