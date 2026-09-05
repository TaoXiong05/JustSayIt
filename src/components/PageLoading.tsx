'use client';

import { useLocale } from '@/lib/i18n/context';

/**
 * 统一的"页面加载中"过渡态——用户明确要求：任何页面在关键状态（目前特指
 * useSession() 的 loading）落定之前，不要把"暂时还不确定对不对"的内容
 * 先画出来再等它跳变（比如 /ledger 对已登录用户先闪一下访客登录卡片，
 * 再翻成 Composer；/settings 先空着账号那一行）。所有依赖 useSession()
 * 的页面（/、/ledger、/login、/settings）在 loading 这段时间统一换成
 * 这一个组件，而不是各自发挥、样子不统一。
 *
 * role="status" + 视觉隐藏的文案：转圈本身对读屏器不说明任何事，
 * aria-hidden 挡掉转圈图形，真正的语义交给这行文字播报。
 */
export function PageLoading() {
  const { t } = useLocale();
  return (
    <main role="status" className="flex min-h-[60vh] items-center justify-center">
      <span
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-muted/30 border-t-brand"
      />
      <span className="sr-only">{t('pageLoading')}</span>
    </main>
  );
}
