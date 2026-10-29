import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';
import { resolveJellyfinUserId } from '@/lib/profiles';
import { MediaItem, MediaRowSection } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 120; // Cache for 2 minutes

interface CategoryDef {
  id: string;
  title: string;
  jfGenrePattern: RegExp;
  seerrGenreId: number;
}

const MOVIE_CATEGORIES: CategoryDef[] = [
  { id: 'cat-action', title: 'Action & Adventure', jfGenrePattern: /action|adventure/i, seerrGenreId: 28 },
  { id: 'cat-comedy', title: 'Comedies', jfGenrePattern: /comedy/i, seerrGenreId: 35 },
  { id: 'cat-scifi', title: 'Sci-Fi & Fantasy', jfGenrePattern: /sci-fi|science fiction|fantasy/i, seerrGenreId: 878 },
  { id: 'cat-horror', title: 'Horror & Thrillers', jfGenrePattern: /horror|thriller/i, seerrGenreId: 27 },
  { id: 'cat-drama', title: 'Dramas', jfGenrePattern: /drama/i, seerrGenreId: 18 },
  { id: 'cat-animation', title: 'Animation & Family', jfGenrePattern: /animation|family/i, seerrGenreId: 16 },
  { id: 'cat-crime', title: 'Crime & Mystery', jfGenrePattern: /crime|mystery/i, seerrGenreId: 80 },
  { id: 'cat-documentary', title: 'Documentaries', jfGenrePattern: /documentary/i, seerrGenreId: 99 },
];

const TV_CATEGORIES: CategoryDef[] = [
  { id: 'cat-tv-drama', title: 'TV Dramas & Binge-Worthy Series', jfGenrePattern: /drama/i, seerrGenreId: 18 },
  { id: 'cat-tv-comedy', title: 'TV Comedies & Sitcoms', jfGenrePattern: /comedy/i, seerrGenreId: 35 },
  { id: 'cat-tv-scifi', title: 'Sci-Fi & Fantasy Series', jfGenrePattern: /sci-fi|science fiction|fantasy/i, seerrGenreId: 10765 },
  { id: 'cat-tv-action', title: 'Action & Adventure TV', jfGenrePattern: /action|adventure/i, seerrGenreId: 10759 },
  { id: 'cat-tv-crime', title: 'Crime & Mystery Series', jfGenrePattern: /crime|mystery/i, seerrGenreId: 80 },
  { id: 'cat-tv-docu', title: 'Docuseries & Reality TV', jfGenrePattern: /documentary|reality/i, seerrGenreId: 99 },
  { id: 'cat-tv-animation', title: 'Anime & Animated Series', jfGenrePattern: /animation|anime/i, seerrGenreId: 16 },
];

export async function GET(
  request: NextRequest,
  { params }: { params: { type: string } }
) {
  const typeParam = (params.type || '').toLowerCase();
  const isMovies = typeParam === 'movies' || typeParam === 'movie';
  const isTv = typeParam === 'tv' || typeParam === 'series' || typeParam === 'shows';

  if (!isMovies && !isTv) {
    return NextResponse.json(
      { error: 'Invalid type. Use "movies" or "series"' },
      { status: 400 }
    );
  }

  const profileId =
    request.nextUrl.searchParams.get('userId') ||
    request.cookies.get('homeflix_profile_id')?.value;
  const targetUserId = await resolveJellyfinUserId(profileId);
  const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);
  const seerr = new SeerrClient();

  const categories = isMovies ? MOVIE_CATEGORIES : TV_CATEGORIES;

  try {
    const uid = targetUserId || (await jellyfin.getFirstUserId());

    // 1. Fetch all items of this type from Jellyfin
    let allJfItems: MediaItem[] = [];
    if (jellyfin.isConfigured()) {
      try {
        const itemType = isMovies ? 'Movie' : 'Series';
        const jfRes = await fetch(
          `${(jellyfin as any).url}/Users/${uid}/Items?IncludeItemTypes=${itemType}&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks,LocationType,MediaStreams,Width,Height,MediaSources`,
          { headers: (jellyfin as any).getHeaders(), next: { revalidate: 60 } }
        );
        if (jfRes.ok) {
          const jfData = await jfRes.json();
          const valid = (jfData.Items || []).filter((i: any) => i.LocationType !== 'Virtual');
          allJfItems = valid.map((i: any) => (jellyfin as any).mapJellyfinItem(i));
          if (!isMovies) {
            allJfItems = await jellyfin.attachPlayableStreamsToItems(allJfItems);
          }
        }
      } catch (e) {
        console.warn('Failed loading Jellyfin items for categories:', e);
      }
    }

    // Set of known Jellyfin TMDB IDs and Titles to avoid Seerr duplication
    const jfTmdbSet = new Set<number>();
    const jfTitleSet = new Set<string>();
    allJfItems.forEach((item) => {
      if (item.tmdbId) jfTmdbSet.add(item.tmdbId);
      if (item.title) jfTitleSet.add(item.title.toLowerCase().trim());
    });

    // 2. Fetch Seerr recommendations for each category in parallel
    const seerrConfigured = seerr.isConfigured();
    const sections: MediaRowSection[] = await Promise.all(
      categories.map(async (cat) => {
        // Find Jellyfin items matching this category
        const jfCategoryItems = allJfItems.filter((item) =>
          item.genres.some((g) => cat.jfGenrePattern.test(g))
        );

        let seerrCategoryItems: MediaItem[] = [];
        if (seerrConfigured) {
          try {
            const rawSeerr = await seerr.getDiscoverByGenre(
              cat.seerrGenreId,
              isMovies ? 'movie' : 'tv'
            );

            // Deduplicate: exclude if already on Jellyfin
            seerrCategoryItems = rawSeerr
              .filter((r) => {
                if (r.tmdbId && jfTmdbSet.has(r.tmdbId)) return false;
                if (jfTitleSet.has(r.title.toLowerCase().trim())) return false;
                return true;
              })
              .slice(0, 15);
          } catch (e) {
            console.warn(`Error fetching Seerr category ${cat.title}:`, e);
          }
        }

        // Jellyfin available first, followed by Seerr options
        const combined = [...jfCategoryItems, ...seerrCategoryItems];

        return {
          id: cat.id,
          title: cat.title,
          items: combined,
        };
      })
    );

    // Filter out categories that have no items at all
    const populatedSections = sections.filter((s) => s.items.length > 0);

    return NextResponse.json({
      type: isMovies ? 'movies' : 'series',
      sections: populatedSections,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Error generating category rows:', message);
    return NextResponse.json(
      { error: `Failed to load categories: ${message}` },
      { status: 500 }
    );
  }
}
