import { authenticate } from '@/lib/server/guard';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if ('bypass' in auth || 'error' in auth) {
    return Response.json({ user: null });
  }
  return Response.json({ user: auth });
}