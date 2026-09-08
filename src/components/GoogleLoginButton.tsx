import { useLocale } from '@/lib/i18n/context';

/**
 * Google 官方四色 G 标志，"使用 Google 登录"按钮的标准画法——按钮本身用
 * Google 品牌指南要求的浅底深字，不跟随这个项目自己的品牌色。
 * 抽成独立组件是因为它现在有两处调用（正常态的可点链接、离线态的禁用态），
 * SVG 路径数据完全相同，不该复制粘贴两份。
 */
function GoogleGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

const SHARED_CLASSNAME =
  'inline-flex items-center gap-2.5 rounded-lg border border-border bg-surface px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors';

/**
 * CTA 直接指向 OAuth 端点、不经过 /login 营销页——会看到这张卡片的人已经
 * 在用产品了，不需要再看一遍营销话术，少一次跳转就少一次流失。
 *
 * 离线时渲染成禁用态（`disabled`，非 `<a>`）：登录本身要走 Google OAuth
 * 的整页跳转，没有网络这一步连开始都开始不了，点一个"看起来能点、点了
 * 却什么都不会发生"的链接比不给这个入口更让人困惑。
 */
export function GoogleLoginButton({ disabled = false }: { disabled?: boolean }) {
  const { t } = useLocale();
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        className={`${SHARED_CLASSNAME} cursor-not-allowed text-muted opacity-60`}
      >
        <GoogleGlyph />
        {t('logInAction')}
      </button>
    );
  }
  return (
    <a href="/api/auth/login" className={`${SHARED_CLASSNAME} text-[#3c4043] hover:bg-surface-2`}>
      <GoogleGlyph />
      {t('logInAction')}
    </a>
  );
}
