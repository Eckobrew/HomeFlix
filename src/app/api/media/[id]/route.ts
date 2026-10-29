import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';
import { resolveJellyfinUserId } from '@/lib/profiles';
import {
  MOCK_HERO_ITEM,
  MOCK_CONTINUE_WATCHING,
  MOCK_RECENT_MOVIES,
  MOCK_RECENT_SERIES,
  MOCK_SEERR_SEARCH_RESULTS,
} from '@/lib/mock-data';
import { MediaItem } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const profileId =
    request.nextUrl.searchParams.get('userId') ||
    request.cookies.get('homeflix_profile_id')?.value;

  const targetUserId = await resolveJellyfinUserId(profileId);
  const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);
  const seerr = new SeerrClient();

  // 1. If it's a Jellyfin ID, fetch full details & episodes from Jellyfin
  if (jellyfin.isConfigured() && !id.startsWith('seerr-') && !id.startsWith('hero-') && !id.startsWith('cw-') && !id.startsWith('mov-') && !id.startsWith('ser-')) {
    const item = await jellyfin.getItemDetails(id);
    if (item) {
      return NextResponse.json(
        { item },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
      );
    }
  }

  // 2. If it's a Seerr item or TMDB ID, fetch full TV details & episodes from Seerr
  if (seerr.isConfigured() && (id.startsWith('seerr-') || /^\d+$/.test(id))) {
    const tmdbId = Number(id.replace('seerr-', ''));
    if (tmdbId > 0) {
      try {
        // Try TV show first (to load seasons & episodes)
        const tvItem = await seerr.getTvDetails(tmdbId);
        if (tvItem && tvItem.seasons && tvItem.seasons.length > 0) {
          return NextResponse.json(
            { item: tvItem },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
          );
        }

        // Try Movie
        const movieItem = await seerr.getMovieDetails(tmdbId);
        if (movieItem) {
          return NextResponse.json(
            { item: movieItem },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
          );
        }

        if (tvItem) {
          return NextResponse.json(
            { item: tvItem },
            { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
          );
        }
      } catch (e) {
        console.error(`Error querying Seerr for media ${id}:`, e);
      }
    }
  }

  // 3. Find in mock data
  const allMock: MediaItem[] = [
    MOCK_HERO_ITEM,
    ...MOCK_CONTINUE_WATCHING,
    ...MOCK_RECENT_MOVIES,
    ...MOCK_RECENT_SERIES,
    ...MOCK_SEERR_SEARCH_RESULTS,
  ];

  const found = allMock.find((m) => m.id === id);

  if (found) {
    return NextResponse.json(
      { item: found },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
    );
  }

  return NextResponse.json({ error: 'Media not found' }, { status: 404 });
}
