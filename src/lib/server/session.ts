import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'justsayit.session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 天

export type SessionUser = {
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * jose 6 主入口是 webapi 实现（纯 WebCrypto，无 Node 专用 bundle），
 * HS256 密钥必须为 CryptoKey。用 crypto.subtle.importKey 从字节导入 HMAC 密钥，
 * 避免跨 realm 下 instanceof Uint8Array / KeyObject 识别失败。
 */
async function secretKey(): Promise<CryptoKey> {
  const s = process.env.SESSION_SECRET ?? '';
  if (s.length < 16) throw new Error('SESSION_SECRET 未配置或过短');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(s),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(
  user: SessionUser,
  expOverrideMs?: number,
): Promise<string> {
  const now = Date.now();
  const key = await secretKey();
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.googleSub)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + (expOverrideMs ?? SESSION_TTL_MS)) / 1000))
    .sign(key);
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const key = await secretKey();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string') return null;
    return {
      googleSub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    };
  } catch {
    return null;
  }
}

export function parseSessionCookie(req: Request): string | null {
  const raw = req.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return rest.join('=');
  }
  return null;
}

export function buildSetCookie(token: string, secure: boolean): string {
  const secureFlag = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}${secureFlag}`;
}