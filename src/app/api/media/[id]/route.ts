import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
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

  if (jellyfin.isConfigured() && !id.startsWith('seerr-') && !id.startsWith('hero-') && !id.startsWith('cw-') && !id.startsWith('mov-') && !id.startsWith('ser-')) {
    const item = await jellyfin.getItemDetails(id);
    if (item) {
      return NextResponse.json(
        { item },
        { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' } }
      );
    }
  }

  // Find in mock data
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
