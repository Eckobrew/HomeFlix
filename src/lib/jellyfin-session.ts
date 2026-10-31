import { AsyncLocalStorage } from 'async_hooks';
import { headers, cookies } from 'next/headers';
import { readSession } from './session';
import { NextRequest } from 'next/server';
import { isRequestLocalOrTailscale } from './network';

type Credentials = { id: string; accessToken: string };
const sessions = new AsyncLocalStorage<Credentials | null>();
export function requestJellyfinSession(): Credentials | null { return sessions.getStore() || null; }

/** Bind user credentials to one request, including delegated native API handlers. */
export function withJellyfinSession<Args extends unknown[], Result>(handler: (...args: Args) => Promise<Result>) {
  return async (...args: Args): Promise<Result> => {
    const authorization = (await headers()).get('authorization') || '';
    const mobile = /^Bearer /i.test(authorization);
    const token = mobile ? authorization.slice(7) : (await cookies()).get('homeflix_session')?.value;
    const session = await readSession(token, mobile ? 'mobile' : 'web');
    const credentials = session?.accessToken ? { id: session.id, accessToken: session.accessToken } : null;
    const request = args[0];
    if (session && request instanceof NextRequest && request.method === 'GET' && !isRequestLocalOrTailscale(request).isLocalOrTailscale) {
      const url = request.nextUrl.clone();
      url.searchParams.set('userId', session.id);
      args[0] = new NextRequest(url, { headers: request.headers, signal: request.signal });
    }
    return sessions.run(credentials, () => handler(...args));
  };
}
