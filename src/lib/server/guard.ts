import type { SessionUser } from '@/lib/server/session';
import { parseSessionCookie, verifySession } from '@/lib/server/session';

export type AuthResult =
  | { bypass: true }
  | (SessionUser)
  | { error: { status: number; body: unknown } };

/**
 * API route 复用：取出并验证 session。
 * 返回 SessionUser → 已认证；`{ bypass: true }` → 逃生舱放行
 * （仅 ALLOW_UNAUTHENTICATED_API=true，见 Global Constraints）；
 * `{ error }` → 直接回该状态码。
 */
export async function authenticate(req: Request): Promise<AuthResult> {
  if (process.env.ALLOW_UNAUTHENTICATED_API === 'true') {
    return { bypass: true };
  }
  const token = parseSessionCookie(req);
  if (!token) return { error: { status: 401, body: { error: '未登录' } } };
  const user = await verifySession(token);
  if (!user) return { error: { status: 401, body: { error: '会话无效或已过期' } } };
  return user;
}