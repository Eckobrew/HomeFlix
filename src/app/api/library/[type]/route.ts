import { withJellyfinSession } from '@/lib/jellyfin-session';
import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { resolveJellyfinUserId } from '@/lib/profiles';
import { MediaItem } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface JellyfinRawItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  PremiereDate?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  Genres?: string[];
  ChildCount?: number;
  Overview?: string;
  BackdropImageTags?: string[];
  LocationType?: string;
  UserData?: {
    PlaybackPositionTicks?: number;
    Played?: boolean;
  };
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const libraryType = ((await params).type || '').toLowerCase();

  if (!['movies', 'tv', 'youtube'].includes(libraryType)) {
    return NextResponse.json(
      { error: 'Invalid library type. Must be movies, tv, or youtube.' },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const letter = (searchParams.get('letter') || '').toUpperCase();
  const search = (searchParams.get('search') || '').trim().toLowerCase();

  const profileId =
    searchParams.get('userId') ||
    request.cookies.get('homeflix_profile_id')?.value;
  const targetUserId = await resolveJellyfinUserId(profileId);
  const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);

  if (!jellyfin.isConfigured()) {
    return NextResponse.json({
      type: libraryType,
      title: libraryType === 'tv' ? 'TV Shows' : libraryType === 'youtube' ? 'YouTube' : 'Movies',
      items: [],
      totalCount: 0,
      filteredCount: 0,
      availableLetters: [],
    });
  }

  try {
    const uid = targetUserId || (await jellyfin.getFirstUserId());

    // 1. Discover user views/libraries to find exact library ParentIds
    let libraryParentId = '';
    let libraryTitle = libraryType === 'tv' ? 'TV Shows' : libraryType === 'youtube' ? 'YouTube' : 'Movies';

    try {
      const viewsRes = await fetch(`${(jellyfin as any).url}/Users/${uid}/Views`, {
        headers: (jellyfin as any).getHeaders(),
        next: { revalidate: 300 },
      });
      if (viewsRes.ok) {
        const viewsData = await viewsRes.json();
        const views = viewsData.Items || [];

        if (libraryType === 'movies') {
          const match = views.find(
            (v: any) =>
              v.CollectionType === 'movies' && !/youtube/i.test(v.Name || '')
          ) || views.find((v: any) => /movies/i.test(v.Name || ''));
          if (match) {
            libraryParentId = match.Id;
            libraryTitle = match.Name || 'Movies';
          }
        } else if (libraryType === 'tv') {
          const match = views.find(
            (v: any) => v.CollectionType === 'tvshows' || /shows|tv/i.test(v.Name || '')
          );
          if (match) {
            libraryParentId = match.Id;
            libraryTitle = match.Name || 'TV Shows';
          }
        } else if (libraryType === 'youtube') {
          const match = views.find(
            (v: any) => /youtube/i.test(v.Name || '') || /youtube/i.test(v.Path || '')
          );
          if (match) {
            libraryParentId = match.Id;
            libraryTitle = match.Name || 'YouTube';
          }
        }
      }
    } catch (e) {
      console.warn('Could not auto-discover views, using defaults:', e);
    }

    // Fallbacks if not auto-discovered
    if (!libraryParentId) {
      if (libraryType === 'movies') libraryParentId = 'f137a2dd21bbc1b99aa5c0f6bf02a805';
      if (libraryType === 'tv') libraryParentId = 'a656b907eb3a73532e40e44b968d0225';
      if (libraryType === 'youtube') libraryParentId = '34f331a89ce405e2b877d68d5ee4d4a2';
    }

    // 2. Query items sorted by SortName Ascending (A-Z)
    // Note: For TV Shows, per user instruction: "In the TV shows sidebar thing just show the series, not individual episodes/seasons"
    let queryParams = `SortBy=SortName&SortOrder=Ascending&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks,LocationType,MediaStreams,Width,Height,MediaSources`;

    if (libraryType === 'movies') {
      queryParams += `&IncludeItemTypes=Movie`;
      if (libraryParentId) queryParams += `&ParentId=${libraryParentId}`;
    } else if (libraryType === 'tv') {
      queryParams += `&IncludeItemTypes=Series`;
      if (libraryParentId) queryParams += `&ParentId=${libraryParentId}`;
    } else if (libraryType === 'youtube') {
      queryParams += `&IncludeItemTypes=Movie,Video`;
      if (libraryParentId) queryParams += `&ParentId=${libraryParentId}`;
    }

    const itemsRes = await fetch(
      `${(jellyfin as any).url}/Users/${uid}/Items?${queryParams}`,
      {
        headers: (jellyfin as any).getHeaders(),
        next: { revalidate: 60 },
      }
    );

    if (!itemsRes.ok) {
      throw new Error(`Jellyfin responded with ${itemsRes.status}`);
    }

    const data = await itemsRes.json();
    const rawItems: JellyfinRawItem[] = (data.Items || []).filter(
      (item: JellyfinRawItem) => item.LocationType !== 'Virtual'
    );

    let mappedItems: MediaItem[] = rawItems.map((item) => (jellyfin as any).mapJellyfinItem(item));

    // For TV series, attach first playable episode previews
    if (libraryType === 'tv') {
      mappedItems = await jellyfin.attachPlayableStreamsToItems(mappedItems);
    }

    // 3. Compute available letters across all library items
    const lettersSet = new Set<string>();
    mappedItems.forEach((item) => {
      const cleanTitle = (item.title || '').trim();
      if (!cleanTitle) return;
      const firstChar = cleanTitle[0].toUpperCase();
      if (/[A-Z]/.test(firstChar)) {
        lettersSet.add(firstChar);
      } else {
        lettersSet.add('#');
      }
    });

    const availableLetters = Array.from(lettersSet).sort((a, b) => {
      if (a === '#') return -1;
      if (b === '#') return 1;
      return a.localeCompare(b);
    });

    // 4. Apply Letter and Search filters
    let filteredItems = mappedItems;

    if (letter && letter !== 'ALL') {
      filteredItems = filteredItems.filter((item) => {
        const cleanTitle = (item.title || '').trim();
        if (!cleanTitle) return false;
        const firstChar = cleanTitle[0].toUpperCase();
        if (letter === '#') {
          return !/[A-Z]/.test(firstChar);
        }
        return firstChar === letter;
      });
    }

    if (search) {
      filteredItems = filteredItems.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          item.overview?.toLowerCase().includes(search) ||
          item.genres.some((g) => g.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      type: libraryType,
      title: libraryTitle,
      items: filteredItems,
      totalCount: mappedItems.length,
      filteredCount: filteredItems.length,
      availableLetters,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error loading library ${libraryType}:`, message);
    return NextResponse.json(
      { error: `Failed to load ${libraryType} library: ${message}` },
      { status: 500 }
    );
  }
}

export const GET = withJellyfinSession(handleGET);
