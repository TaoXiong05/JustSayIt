import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function keyBytes(): Buffer {
  const hex = process.env.REFRESH_TOKEN_ENCRYPTION_KEY ?? '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('REFRESH_TOKEN_ENCRYPTION_KEY 必须是 32 字节的 hex');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptRefreshToken(plain: string): string {
  const key = keyBytes();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: data.toString('hex'),
  });
}

export function decryptRefreshToken(enc: string): string {
  const key = keyBytes();
  const { iv, tag, data } = JSON.parse(enc) as { iv: string; tag: string; data: string };
  const decipher = createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}