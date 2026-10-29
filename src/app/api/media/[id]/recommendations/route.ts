import { NextRequest, NextResponse } from 'next/server';
import { SeerrClient } from '@/lib/seerr';
import { JellyfinClient } from '@/lib/jellyfin';
import { MediaItem } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const { searchParams } = new URL(request.url);
  const typeParam = searchParams.get('type') || 'movie';
  const tmdbIdParam = searchParams.get('tmdbId');

  const mediaType: 'movie' | 'tv' = typeParam === 'tv' || typeParam === 'Series' ? 'tv' : 'movie';
  const seerr = new SeerrClient();
  const jellyfin = new JellyfinClient();

  let tmdbId = tmdbIdParam ? Number(tmdbIdParam) : 0;
  let recommendations: MediaItem[] = [];

  // 1. If it's a Seerr item or numeric TMDB ID
  if (id.startsWith('seerr-') || /^\d+$/.test(id)) {
    if (!tmdbId) {
      tmdbId = Number(id.replace('seerr-', '')) || 0;
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

      const resolvedTmdbId = tmdbId || itemDetails?.tmdbId;

      let seerrRecs: MediaItem[] = [];
      if (resolvedTmdbId && seerr.isConfigured()) {
        seerrRecs = await seerr.getRecommendations(resolvedTmdbId, mediaType);
      }

      // Merge: Jellyfin items (already available) first, then Seerr recommendations (for download)
      const seenTitles = new Set<string>();
      const combined: MediaItem[] = [];

      for (const item of similarFromJellyfin) {
        const normTitle = item.title.toLowerCase().trim();
        if (!seenTitles.has(normTitle)) {
          seenTitles.add(normTitle);
          combined.push(item);
        }
      }

      for (const item of seerrRecs) {
        const normTitle = item.title.toLowerCase().trim();
        if (!seenTitles.has(normTitle)) {
          seenTitles.add(normTitle);
          combined.push(item);
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
