import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

/** §11.2：一次性请求全部 scope，不使用增量授权 */
export const SCOPE = 'openid email profile drive.appdata';

function clientConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redirect) throw new Error('缺少 Google OAuth 配置');
  return { id, secret, redirect };
}

export type GoogleProfile = {
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

export function buildAuthorizeUrl(state: string, nonce: string): string {
  const { id, redirect } = clientConfig();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'select_account',
    state,
    nonce,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

const googleJWKS = createRemoteJWKSet(new URL(JWKS_URI));

export async function verifyIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<GoogleProfile> {
  const { id } = clientConfig();
  const { payload } = await jwtVerify(idToken, googleJWKS, {
    audience: id,
    issuer: ['https://accounts.google.com', 'https://accounts.google.com/'],
    algorithms: ['RS256', 'ES256'],
  });
  // nonce 防重放：与 login 时生成的随机数比对
  if (expectedNonce != null && payload.nonce !== expectedNonce) {
    throw new Error('ID token nonce 不匹配');
  }
  if (typeof payload.sub !== 'string') throw new Error('ID token 缺少 sub');
  return {
    googleSub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}

export async function exchangeCode(
  code: string,
): Promise<{ idToken: string; refreshToken?: string }> {
  const { id, secret, redirect } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token 交换失败：HTTP ${res.status}`);
  const data = (await res.json()) as {
    id_token?: string;
    refresh_token?: string;
  };
  if (!data.id_token) throw new Error('Google token 响应缺少 id_token');
  return { idToken: data.id_token, refreshToken: data.refresh_token };
}