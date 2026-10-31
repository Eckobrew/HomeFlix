import { NextRequest, NextResponse } from 'next/server';
import { isRequestLocalOrTailscale } from '@/lib/network';
import { readSession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // Native routes validate their own bearer token. The auth route must permit login.
  if (path === '/api/auth' || path.startsWith('/api/mobile/v1/')) return NextResponse.next();
  const webhookToken = process.env.HOMESTREAM_WEBHOOK_TOKEN || '';
  if (path === '/api/webhook/arr' && webhookToken.length >= 32 && request.headers.get('authorization') === `Bearer ${webhookToken}`) return NextResponse.next();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }
  const local = isRequestLocalOrTailscale(request).isLocalOrTailscale;
  const session = await readSession(request.cookies.get('homeflix_session')?.value, 'web');
  const setupToken = process.env.HOMESTREAM_SETUP_TOKEN || '';
  const setup = setupToken.length >= 32 && request.headers.get('authorization') === `Bearer ${setupToken}`;
  if (!local && !session && !setup) return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if ((path === '/api/config' || (path === '/api/profiles' && request.method !== 'GET')) && !local && !session?.admin && !setup) {
    return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
  }
  let response: NextResponse;
  if (session && !local) {
    const headers = new Headers(request.headers);
    const cookies = request.cookies.getAll().filter(cookie => cookie.name !== 'homeflix_profile_id');
    headers.set('cookie', [...cookies.map(cookie => `${cookie.name}=${cookie.value}`), `homeflix_profile_id=${session.id}`].join('; '));
    response = NextResponse.next({ request: { headers } });
  } else response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = { matcher: ['/api/:path*'] };
