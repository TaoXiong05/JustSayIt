import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticate } from '@/lib/server/guard';

vi.mock('@/lib/server/session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/server/session')>(
      '@/lib/server/session',
    );
  return { ...actual, verifySession: vi.fn() };
});

import { verifySession, SESSION_COOKIE } from '@/lib/server/session';

const USER = { googleSub: 's1', email: null, name: null, picture: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ALLOW_UNAUTHENTICATED_API = 'false';
});
afterEach(() => {
  delete process.env.ALLOW_UNAUTHENTICATED_API;
});

describe('authenticate', () => {
  it('有效 session → 返回用户', async () => {
    vi.mocked(verifySession).mockResolvedValue(USER);
    const req = new Request('http://x/', {
      headers: { cookie: `${SESSION_COOKIE}=tok` },
    });
    expect(await authenticate(req)).toEqual(USER);
  });

  it('无 cookie → 401', async () => {
    const r = await authenticate(new Request('http://x/'));
    expect('error' in r && r.error.status === 401).toBe(true);
  });

  it('无效 session → 401', async () => {
    vi.mocked(verifySession).mockResolvedValue(null);
    const req = new Request('http://x/', {
      headers: { cookie: `${SESSION_COOKIE}=bad` },
    });
    const r = await authenticate(req);
    expect('error' in r && r.error.status === 401).toBe(true);
  });

  it('ALLOW_UNAUTHENTICATED_API=true → 放行（bypass）', async () => {
    process.env.ALLOW_UNAUTHENTICATED_API = 'true';
    const r = await authenticate(new Request('http://x/'));
    expect('bypass' in r && r.bypass === true).toBe(true);
  });
});