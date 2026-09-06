import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_URI = 'https://www.googleapis.com/oauth2/v3/certs';

/**
 * §11.2：一次性请求全部 scope，不使用增量授权。
 * openid/email/profile 是 Google 识别的内置短别名会被自动展开；
 * drive.appdata 不是短别名，必须写完整 scope URI，否则 Google 返回
 * invalid_scope（实测：短别名报错时 Google 只把 email/profile 展开进
 * valid 列表，drive.appdata 会原样出现在 invalid 里）。
 */
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export const SCOPE = `openid email profile ${DRIVE_APPDATA_SCOPE}`;

function clientConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('缺少 Google OAuth 配置');
  return { id, secret };
}

/**
 * 开发环境下按实际请求来源推导 redirect_uri（方便局域网多设备测试——
 * 手机访问的是 http://<局域网IP>:3000，不是 localhost，不想每次测试
 * 都手动改 .env）；生产环境固定用 GOOGLE_REDIRECT_URI，不依赖
 * request.url 的 host——反向代理场景下这个值不一定可靠，生产环境的
 * 域名也没有"来回切换"这个需求。
 * 不管走哪条路径，最终值都必须和 Google Cloud Console 里登记的
 * "Authorized redirect URI" 精确匹配，否则 Google 直接拒绝这次请求。
 */
function resolveRedirectUri(requestOrigin?: string): string {
  if (process.env.NODE_ENV !== 'production' && requestOrigin) {
    return `${requestOrigin}/api/auth/callback`;
  }
  const configured = process.env.GOOGLE_REDIRECT_URI;
  if (!configured) throw new Error('缺少 GOOGLE_REDIRECT_URI');
  return configured;
}

export type GoogleProfile = {
  googleSub: string;
  email: string | null;
  name: string | null;
  picture: string | null;
};

/**
 * forceConsent：Google 只在「这个 client+账号+scope 组合第一次授权」时才会
 * 在 code 交换响应里带 refresh_token，之后的登录（哪怕 access_type=offline）
 * 默认不会再给一次——除非用 prompt=consent 强制重新走一遍同意页。
 * 这意味着一旦旧 refresh token 失效（用户在 Google 后台撤销、client 换了、
 * 密钥轮换等），单纯"退出登录再登录"并不能自动换到新 token，必须走这条
 * 强制同意的路径（由 /api/auth/login?reauth=1 触发，drive-token 返回
 * DRIVE_REAUTH_REQUIRED 时 UI 引导用户点这里，见 SyncWarning.tsx）。
 */
export function buildAuthorizeUrl(
  state: string,
  nonce: string,
  requestOrigin?: string,
  options?: { forceConsent?: boolean },
): string {
  const { id } = clientConfig();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: resolveRedirectUri(requestOrigin),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: options?.forceConsent ? 'consent' : 'select_account',
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
  requestOrigin?: string,
): Promise<{ idToken: string; refreshToken?: string }> {
  const { id, secret } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: resolveRedirectUri(requestOrigin),
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

/**
 * 用 refresh token 换一个短期 access token（spec §11.3 令牌流的核心动作）。
 * 只在服务端调用——refresh token 从不进入浏览器。
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number; scope: string | null }> {
  const { id, secret } = clientConfig();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`Google token 刷新失败：HTTP ${res.status}`);
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) throw new Error('Google 刷新响应缺少 access_token');
  // scope 是刷新响应里 Google 实际授予的权限清单——它反映的是这个 refresh
  // token 当初被签发时同意过的范围，跟后来在 Cloud Console 里改成什么无关
  // （见 drive-token 路由里的校验）。字段本身是可选的，拿不到就是 null。
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? null,
  };
}