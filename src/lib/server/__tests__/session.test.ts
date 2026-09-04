import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SESSION_COOKIE,
  signSession,
  verifySession,
  parseSessionCookie,
  buildSetCookie,
} from '@/lib/server/session';

const SECRET = 'b'.repeat(64);
const ORIG = process.env.SESSION_SECRET;
const USER = { googleSub: 'sub-123', email: 'a@b.c', name: 'A', picture: null };

beforeEach(() => vi.stubEnv('SESSION_SECRET', SECRET));
afterEach(() => vi.stubEnv('SESSION_SECRET', ORIG ?? ''));

describe('session', () => {
  it('签发后能验证回原用户', async () => {
    const t = await signSession(USER);
    expect(await verifySession(t)).toEqual(USER);
  });

  it('过期 token 返回 null', async () => {
    const t = await signSession(USER, -100);
    expect(await verifySession(t)).toBeNull();
  });

  it('被篡改的 token 返回 null', async () => {
    const t = await signSession(USER);
    const bad = t.slice(0, -2) + (t.endsWith('a') ? 'b' : 'a');
    expect(await verifySession(bad)).toBeNull();
  });

  it('cookie 头解析出 token', () => {
    const req = new Request('http://x/', {
      headers: { cookie: `${SESSION_COOKIE}=abc123; other=1` },
    });
    expect(parseSessionCookie(req)).toBe('abc123');
  });

  it('无 cookie 时解析为 null', () => {
    expect(parseSessionCookie(new Request('http://x/'))).toBeNull();
  });

  it('Set-Cookie 包含 httpOnly / sameSite', () => {
    const v = buildSetCookie('tok', true);
    expect(v).toContain('HttpOnly');
    expect(v).toContain('SameSite=Lax');
    expect(v).toContain('Secure');
  });
});