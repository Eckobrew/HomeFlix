import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GET as home } from '@/app/api/home/route';
import { GET as library } from '@/app/api/library/[type]/route';
import { GET as details } from '@/app/api/media/[id]/route';
import { GET as playback } from '@/app/api/playback/route';
import { POST as progress } from '@/app/api/playback/progress/route';
import { GET as subtitles } from '@/app/api/subtitles/route';
import { POST as requestMedia } from '@/app/api/request/route';
import { getHomeflixProfiles } from '@/lib/profiles';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: { path: string[] } };

function authorize(request: NextRequest): NextResponse | undefined {
  const expected = process.env.HOMESTREAM_MOBILE_TOKEN || '';
  if (expected.length < 32) {
    return NextResponse.json({ error: 'Mobile API disabled. Set HOMESTREAM_MOBILE_TOKEN to at least 32 characters.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  const provided = /^Bearer /i.test(authorization) ? authorization.slice(7) : '';
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid pairing token' }, { status: 401 });
  }
}

async function dispatch(request: NextRequest, { params }: Context) {
  const denied = authorize(request);
  if (denied) return denied;
  const route = params.path.join('/');
  const get = request.method === 'GET';
  if (get && route === 'capabilities') {
    return NextResponse.json({ apiVersion: 1, appName: 'HomeStream', cast: true });
  }
  // Pairing tokens grant household access. Profile IDs select watch history;
  // they are not individual authentication or parental-control boundaries.
  if (get && route === 'profiles') {
    return NextResponse.json({ profiles: await getHomeflixProfiles() });
  }
  if (get && route === 'home') return home(request);
  if (get && /^library\/(movies|tv)$/.test(route)) {
    return library(request, { params: { type: params.path[1] } });
  }
  if (get && params.path.length === 2 && params.path[0] === 'media') {
    return details(request, { params: { id: params.path[1] } });
  }
  if (get && route === 'playback') {
    const ticks = request.nextUrl.searchParams.get('startTimeTicks');
    if (ticks !== null && (!Number.isSafeInteger(Number(ticks)) || Number(ticks) < 0)) {
      return NextResponse.json({ error: 'Invalid startTimeTicks' }, { status: 400 });
    }
    return playback(request);
  }
  if (get && route === 'subtitles') return subtitles(request);
  if (!get && route === 'progress') {
    let body;
    try { body = await request.clone().json(); } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'JSON object required' }, { status: 400 });
    }
    if (typeof body.itemId !== 'string' || !body.itemId ||
        !Number.isSafeInteger(body.positionTicks) || body.positionTicks < 0) {
      return NextResponse.json({ error: 'Valid itemId and nonnegative positionTicks required' }, { status: 400 });
    }
    return progress(request);
  }
  if (!get && route === 'request') return requestMedia(request);
  return NextResponse.json({ error: 'Unknown mobile endpoint' }, { status: 404 });
}

async function handle(request: NextRequest, context: Context) {
  let response: Response;
  try {
    response = await dispatch(request, context);
  } catch (error) {
    console.error('Mobile API request failed:', error);
    response = NextResponse.json({ error: 'Mobile API request failed' }, { status: 500 });
  }
  // Never cache profile history or URLs containing Jellyfin stream credentials.
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const GET = handle;
export const POST = handle;
