import { withJellyfinSession } from '@/lib/jellyfin-session';
import { NextRequest, NextResponse } from 'next/server';
import { SeerrClient } from '@/lib/seerr';
import { JellyfinClient } from '@/lib/jellyfin';
import { MediaItem } from '@/types';
import { resolveJellyfinUserId } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type') || '';
  const tmdbIdParam = searchParams.get('tmdbId');

  let mediaType: 'movie' | 'tv' =
    typeParam === 'tv' || typeParam === 'Series' || typeParam === 'Episode' ? 'tv' : 'movie';
  if (id.startsWith('seerr-tv-')) {
    mediaType = 'tv';
  } else if (id.startsWith('seerr-movie-')) {
    mediaType = 'movie';
  }

  const seerr = new SeerrClient();
  const uid = await resolveJellyfinUserId(searchParams.get('userId') || request.cookies.get('homeflix_profile_id')?.value);
  const jellyfin = new JellyfinClient(undefined, undefined, uid);

  let tmdbId = tmdbIdParam ? Number(tmdbIdParam) : 0;
  let recommendations: MediaItem[] = [];

  // 1. If it's a Seerr item or numeric TMDB ID
  if (id.startsWith('seerr-') || /^\d+$/.test(id)) {
    if (!tmdbId) {
      tmdbId = Number(id.replace(/^seerr-(?:movie-|tv-)?/, '')) || 0;
    }

    if (tmdbId > 0 && seerr.isConfigured()) {
      recommendations = await seerr.getRecommendations(tmdbId, mediaType);
    }
  } else if (jellyfin.isConfigured()) {
    // 2. It's a Jellyfin item ID
    try {
      const [similarFromJellyfin, itemDetails] = await Promise.all([
        jellyfin.getSimilarItems(id, 8),
        jellyfin.getItemDetails(id),
      ]);

      if (itemDetails?.type === 'Series' || itemDetails?.type === 'Episode') {
        mediaType = 'tv';
      } else if (itemDetails?.type === 'Movie') {
        mediaType = 'movie';
      }

      let resolvedTmdbId = tmdbId || itemDetails?.tmdbId;

      // If tmdbId wasn't in ProviderIds, search Seerr by title to discover its TMDB ID
      if (!resolvedTmdbId && itemDetails?.title && seerr.isConfigured()) {
        try {
          const searchRes = await seerr.search(itemDetails.title);
          const expectedType = mediaType === 'tv' ? 'Series' : 'Movie';
          const match = searchRes.find((r) => r.type === expectedType) || searchRes[0];
          if (match?.tmdbId) {
            resolvedTmdbId = match.tmdbId;
          }
        } catch (err) {
          console.error(`Failed to resolve TMDB ID from Seerr for "${itemDetails.title}":`, err);
        }
      }

      let seerrRecs: MediaItem[] = [];
      if (resolvedTmdbId && seerr.isConfigured()) {
        seerrRecs = await seerr.getRecommendations(resolvedTmdbId, mediaType);
      }

      // Merge: Combine both Seerr suggestions and Jellyfin suggestions evenly without prioritizing one over the other
      const seenTitles = new Set<string>();
      const combined: MediaItem[] = [];

      const maxLen = Math.max(similarFromJellyfin.length, seerrRecs.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < seerrRecs.length) {
          const s = seerrRecs[i];
          const normTitle = s.title.toLowerCase().trim();
          if (!seenTitles.has(normTitle)) {
            seenTitles.add(normTitle);
            combined.push(s);
          }
        }
        if (i < similarFromJellyfin.length) {
          const j = similarFromJellyfin[i];
          const normTitle = j.title.toLowerCase().trim();
          if (!seenTitles.has(normTitle)) {
            seenTitles.add(normTitle);
            combined.push(j);
          }
        }
      }

      recommendations = combined;
    } catch (e) {
      console.error(`Error fetching recommendations for Jellyfin item ${id}:`, e);
    }
  }

  // Fallback if none found: if tmdbId is available, try Seerr recommendations
  if (recommendations.length === 0 && tmdbId > 0 && seerr.isConfigured()) {
    recommendations = await seerr.getRecommendations(tmdbId, mediaType);
  }

  return NextResponse.json(
    { success: true, recommendations },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    }
  );
}

export const GET = withJellyfinSession(handleGET);
