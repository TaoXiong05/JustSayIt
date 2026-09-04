import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encryptRefreshToken, decryptRefreshToken } from '@/lib/server/crypto';

const KEY = 'a'.repeat(64); // 32 字节 hex
const ORIG = process.env.REFRESH_TOKEN_ENCRYPTION_KEY;

beforeEach(() => vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', KEY));
afterEach(() => vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', ORIG ?? ''));

describe('refresh token crypto', () => {
  it('加密后能解密回原值', () => {
    const enc = encryptRefreshToken('ya29.some-token-value');
    expect(enc).not.toContain('ya29.');
    expect(decryptRefreshToken(enc)).toBe('ya29.some-token-value');
  });

  it('同一明文两次加密结果不同（随机 IV）', () => {
    expect(encryptRefreshToken('tok')).not.toBe(encryptRefreshToken('tok'));
  });

  it('缺少密钥时抛错', () => {
    vi.stubEnv('REFRESH_TOKEN_ENCRYPTION_KEY', '');
    expect(() => encryptRefreshToken('x')).toThrow();
  });

  it('密文被篡改时抛错', () => {
    const enc = encryptRefreshToken('token');
    const t = JSON.parse(enc) as { iv: string; tag: string; data: string };
    t.data = t.data.slice(0, -2) + '00';
    expect(() => decryptRefreshToken(JSON.stringify(t))).toThrow();
  });
});