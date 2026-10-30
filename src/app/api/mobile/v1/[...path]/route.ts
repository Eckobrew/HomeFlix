import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GET as home } from '@/app/api/home/route';
import { GET as library } from '@/app/api/library/[type]/route';
import { GET as details } from '@/app/api/media/[id]/route';
import { GET as recommendations } from '@/app/api/media/[id]/recommendations/route';
import { GET as categories } from '@/app/api/categories/[type]/route';
import { GET as search } from '@/app/api/search/route';
import { GET as downloads } from '@/app/api/downloads/route';
import { GET as streamDownload } from '@/app/api/stream/download/route';
import { GET as playback } from '@/app/api/playback/route';
import { POST as progress } from '@/app/api/playback/progress/route';
import { GET as subtitles } from '@/app/api/subtitles/route';
import { GET as trailer } from '@/app/api/trailer/route';
import { POST as requestMedia } from '@/app/api/request/route';
import { handleImage } from '@/lib/image-proxy';
import { getHomeflixProfiles } from '@/lib/profiles';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: { path: string[] } };

function authorize(request: NextRequest, isImageRoute: boolean = false): NextResponse | undefined {
  const expected = process.env.HOMESTREAM_MOBILE_TOKEN || '';
  if (expected.length < 6) {
    return NextResponse.json({ error: 'Mobile API disabled. Set HOMESTREAM_MOBILE_TOKEN to at least 6 characters.' }, { status: 503 });
  }
  const authorization = request.headers.get('authorization') || '';
  let provided = /^Bearer /i.test(authorization) ? authorization.slice(7) : '';
  if (!provided) {
    provided = request.nextUrl.searchParams.get('token') || '';
  }
  // Image assets may be loaded by native ImageViews (Coil) or Cast receivers without bearer headers
  if (isImageRoute && !provided) {
    return undefined;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid pairing token' }, { status: 401 });
  }
}

async function dispatch(request: NextRequest, { params }: Context) {
  const route = params.path.join('/');
  const isImageRoute = route === 'image';
  const denied = authorize(request, isImageRoute);
  if (denied) return denied;

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
  if (get && /^library\/(movies|tv|youtube)$/.test(route)) {
    return library(request, { params: { type: params.path[1] } });
  }
  if (get && params.path.length === 2 && params.path[0] === 'media') {
    return details(request, { params: { id: params.path[1] } });
  }
  if (get && params.path.length === 3 && params.path[0] === 'media' && params.path[2] === 'recommendations') {
    return recommendations(request, { params: { id: params.path[1] } });
  }
  if (get && params.path.length === 3 && params.path[0] === 'media' && params.path[2] === 'collection') {
    const id = params.path[1];
    let tmdbId = 0;
    if (id.startsWith('seerr-movie-')) tmdbId = Number(id.replace('seerr-movie-', ''));
    else if (id.startsWith('seerr-')) tmdbId = Number(id.replace(/^seerr-(?:movie-|tv-)?/, ''));
    else if (/^\d+$/.test(id)) tmdbId = Number(id);

    const seerr = new SeerrClient();
    const jellyfin = new JellyfinClient();

    if (!tmdbId && jellyfin.isConfigured()) {
      try {
        const jfCol = await jellyfin.getMovieCollection(id);
        if (jfCol.length > 0) {
          return NextResponse.json({ collection: { name: 'Movie Collection', parts: jfCol } });
        }
        const item = await jellyfin.getItemDetails(id);
        if (item?.tmdbId) tmdbId = item.tmdbId;
      } catch {}
    }

    if (tmdbId && seerr.isConfigured()) {
      try {
        const col = await seerr.getMovieCollection(tmdbId);
        if (col) {
          return NextResponse.json({ collection: col });
        }
      } catch {}
    }

    return NextResponse.json({ collection: null });
  }
  if (get && route === 'trailer') return trailer(request);
  if (get && /^categories\/(movies|tv|requests)$/.test(route)) {
    return categories(request, { params: { type: params.path[1] } });
  }
  if (get && route === 'search') return search(request);
  if (get && route === 'downloads') return downloads();
  if (get && route === 'stream/download') return streamDownload(request);
  if (get && route === 'image') return handleImage(request);
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
  // Never cache profile history or URLs containing Jellyfin stream credentials,
  // but preserve public cache controls on safe media image assets.
  const route = context.params.path.join('/');
  if (route !== 'image') {
    response.headers.set('Cache-Control', 'no-store');
  }
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
}

export const GET = handle;
export const POST = handle;
