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

  // 2. If it's a Seerr item or TMDB ID, fetch full Movie or TV details & episodes from Seerr
  if (seerr.isConfigured() && (id.startsWith('seerr-') || /^\d+$/.test(id))) {
    let tmdbId = 0;
    let explicitType: 'movie' | 'tv' | null = null;

    if (id.startsWith('seerr-movie-')) {
      explicitType = 'movie';
      tmdbId = Number(id.replace('seerr-movie-', ''));
    } else if (id.startsWith('seerr-tv-')) {
      explicitType = 'tv';
      tmdbId = Number(id.replace('seerr-tv-', ''));
    } else if (id.startsWith('seerr-')) {
      tmdbId = Number(id.replace('seerr-', ''));
    } else {
      tmdbId = Number(id);
    }

    const typeQuery = request.nextUrl.searchParams.get('type')?.toLowerCase();
    if (typeQuery === 'movie') {
      explicitType = 'movie';
    } else if (typeQuery === 'tv' || typeQuery === 'series') {
      explicitType = 'tv';
    }

    if (tmdbId > 0) {
      try {
        if (explicitType === 'movie') {
          const movieItem = await seerr.getMovieDetails(tmdbId);
          if (movieItem) {
            return NextResponse.json(
              { item: movieItem },
              { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
            );
          }
        } else if (explicitType === 'tv') {
          const tvItem = await seerr.getTvDetails(tmdbId);
          if (tvItem) {
            return NextResponse.json(
              { item: tvItem },
              { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
            );
          }
        } else {
          // If no type was specified (legacy ID e.g. seerr-27205 without type param),
          // Check movie details first
          const movieItem = await seerr.getMovieDetails(tmdbId);
          if (movieItem) {
            return NextResponse.json(
              { item: movieItem },
              { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
            );
          }
          const tvItem = await seerr.getTvDetails(tmdbId);
          if (tvItem) {
            return NextResponse.json(
              { item: tvItem },
              { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
            );
          }
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
