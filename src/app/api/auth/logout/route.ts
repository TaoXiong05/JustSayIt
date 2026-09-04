import { SESSION_COOKIE } from '@/lib/server/session';

export const runtime = 'nodejs';
const secure = process.env.NODE_ENV === 'production';

export async function POST() {
  const secureFlag = secure ? '; Secure' : '';
  // 清 session cookie（Max-Age=0 让浏览器立即删除）
  const cookie = `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie } });
}