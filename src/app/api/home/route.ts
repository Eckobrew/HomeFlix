import { NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';
import {
  MOCK_HERO_ITEM,
  MOCK_CONTINUE_WATCHING,
  MOCK_RECENT_MOVIES,
  MOCK_RECENT_SERIES,
  MOCK_TOP_10,
} from '@/lib/mock-data';
import { MediaItem, MediaRowSection } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jellyfin = new JellyfinClient();
  const seerr = new SeerrClient();

  const isJellyfinActive = jellyfin.isConfigured();

  if (!isJellyfinActive) {
    // 5 diverse mock hero items for cycling billboard
    const mockHeroItems = [
      MOCK_HERO_ITEM,
      MOCK_CONTINUE_WATCHING[0], // Dune: Part Two
      MOCK_CONTINUE_WATCHING[1], // Severance
      MOCK_RECENT_MOVIES[0],     // Oppenheimer
      MOCK_RECENT_SERIES[0],     // The Bear
    ];

    const sections: MediaRowSection[] = [
      {
        id: 'continue-watching',
        title: 'Continue Watching',
        items: MOCK_CONTINUE_WATCHING,
      },
      {
        id: 'top-10',
        title: 'Top 10 on HomeFlix Today',
        items: MOCK_TOP_10,
        isTop10: true,
      },
      {
        id: 'recent-movies',
        title: 'Recently Added Movies',
        items: MOCK_RECENT_MOVIES,
      },
      {
        id: 'recent-series',
        title: 'Recently Added TV Shows',
        items: MOCK_RECENT_SERIES,
      },
      {
        id: 'trending-seerr',
        title: 'Popular on Streaming',
        items: [...MOCK_RECENT_MOVIES].reverse(),
      },
    ];

    return NextResponse.json({
      hero: MOCK_HERO_ITEM,
      heroItems: mockHeroItems,
      sections,
      isDemoMode: true,
      jellyfinConnected: false,
      seerrConnected: seerr.isConfigured(),
    });
  }

  try {
    const [resumeItems, latestMovies, latestSeries, topRated] = await Promise.all([
      jellyfin.getResumeItems(),
      jellyfin.getLatestMedia('Movie', 15),
      jellyfin.getLatestMedia('Series', 15),
      jellyfin.getTopRated(15),
    ]);

    // Build 5 diverse hero candidates (prefer items with high quality backdrops)
    const allCandidates: MediaItem[] = [
      ...topRated,
      ...latestMovies,
      ...latestSeries,
      ...resumeItems,
    ];

    const uniqueCandidatesMap = new Map<string, MediaItem>();
    allCandidates.forEach((item) => {
      // Prefer items that have backdrop and synopsis
      if (item.backdropUrl && item.overview && item.overview.length > 20) {
        if (!uniqueCandidatesMap.has(item.id)) {
          uniqueCandidatesMap.set(item.id, item);
        }
      }
    });

    let heroCandidates = Array.from(uniqueCandidatesMap.values());
    if (heroCandidates.length < 5) {
      // Fill with any candidates if backdrops are scarce
      allCandidates.forEach((item) => {
        if (!uniqueCandidatesMap.has(item.id)) {
          uniqueCandidatesMap.set(item.id, item);
        }
      });
      heroCandidates = Array.from(uniqueCandidatesMap.values());
    }

    const featuredHeroItems = heroCandidates.slice(0, 5);
    const heroCandidate = featuredHeroItems[0] || resumeItems[0] || latestMovies[0] || MOCK_HERO_ITEM;

    const sections: MediaRowSection[] = [];

    if (resumeItems.length > 0) {
      sections.push({
        id: 'continue-watching',
        title: 'Continue Watching',
        items: resumeItems,
      });
    }

    if (topRated.length > 0) {
      sections.push({
        id: 'top-10',
        title: 'Top 10 on HomeFlix Today',
        items: topRated.slice(0, 10),
        isTop10: true,
      });
    }

    if (latestMovies.length > 0) {
      sections.push({
        id: 'recent-movies',
        title: 'Recently Added Movies',
        items: latestMovies,
      });
    }

    if (latestSeries.length > 0) {
      sections.push({
        id: 'recent-series',
        title: 'Recently Added TV Shows',
        items: latestSeries,
      });
    }

    // Try fetching trending from Seerr if configured
    if (seerr.isConfigured()) {
      const trending = await seerr.getTrending();
      if (trending.length > 0) {
        sections.push({
          id: 'trending-seerr',
          title: 'Trending Worldwide (Seerr)',
          items: trending,
        });
      }
    }

    return NextResponse.json({
      hero: heroCandidate,
      heroItems: featuredHeroItems.length > 0 ? featuredHeroItems : [heroCandidate],
      sections,
      isDemoMode: false,
      jellyfinConnected: true,
      seerrConnected: seerr.isConfigured(),
    });
  } catch (err: unknown) {
    console.error('Error fetching home data from Jellyfin:', err);
    return NextResponse.json({
      hero: MOCK_HERO_ITEM,
      heroItems: [MOCK_HERO_ITEM],
      sections: [
        { id: 'continue-watching', title: 'Continue Watching', items: MOCK_CONTINUE_WATCHING },
        { id: 'recent-movies', title: 'Recently Added Movies', items: MOCK_RECENT_MOVIES },
      ],
      isDemoMode: true,
      error: 'Failed to fetch from Jellyfin, fallback to demo mode',
    });
  }
}
