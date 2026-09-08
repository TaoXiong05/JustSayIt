import { reloadSession } from '@/lib/auth/client';

/** 携带服务端 error code 的 Error——UI 层据此选择本地化文案，不解析消息文本。 */
export class ApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/**
 * 从失败的 Response 里取出 { error, code }，包成 ApiError 抛出。
 * body 不是合法 JSON（网关错误页等）时退回 fallbackMessage，不带 code。
 *
 * code 是 UNAUTHENTICATED（会话已失效/未登录，见 server/guard.ts）时顺带
 * 触发一次 reloadSession()：本 tab/PWA 窗口的登录态缓存是独立单例，只有
 * 挂载时拉取过一次，不会自己发现"session 在别处已经失效"——不重新拉一次，
 * 页面会一直卡在"看着已登录、一操作就 401"却又不出现登录入口的死角
 * （见 auth/client.ts 的 cached 单例说明）。DRIVE_REAUTH_REQUIRED 之类
 * 其它 401 不在此列——那是 Drive 授权本身的问题，跟 app 会话是否有效无关。
 */
export async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof body.code === 'string') code = body.code;
  } catch {
    // 忽略——用 fallback
  }
  if (code === 'UNAUTHENTICATED') void reloadSession();
  throw new ApiError(fallbackMessage, code);
}
