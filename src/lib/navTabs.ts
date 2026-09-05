import { BarChart3, History, ReceiptText, type LucideIcon } from 'lucide-react';

/**
 * 主导航的三个目的地，BottomNav（移动端）和 TopNav（桌面端）共用同一份
 * 定义——此前两个组件各自维护一份字面量相同的数组，注释却声称共用，容易
 * 在新增导航项时只改一处、静默漂移（Global Constraint 6 对 MonthSwitcher
 * 的要求同样适用于这里：共用逻辑只写一份）。
 */
export const NAV_TABS: { href: string; key: 'navLedger' | 'navHistory' | 'navStats'; icon: LucideIcon }[] = [
  { href: '/ledger', key: 'navLedger', icon: ReceiptText },
  { href: '/history', key: 'navHistory', icon: History },
  { href: '/stats', key: 'navStats', icon: BarChart3 },
];
