import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  const canPlayHevc = searchParams.get('canPlayHevc') === 'true';
  const forceTranscode = searchParams.get('forceTranscode') === 'true';
  const startTimeTicks = searchParams.get('startTimeTicks')
    ? Number(searchParams.get('startTimeTicks'))
    : undefined;

  if (!itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  const profileId = searchParams.get('userId') || request.cookies.get('homeflix_profile_id')?.value;
  const jellyfin = new JellyfinClient(undefined, undefined, profileId);
  if (!jellyfin.isConfigured()) {
    return NextResponse.json(
      { error: 'Jellyfin is not configured' },
      { status: 503 }
    );
  }

  try {
    const result = await jellyfin.getPlaybackStream(itemId, {
      canPlayHevc,
      forceTranscode,
      startTimeTicks,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get playback stream:', error);
    return NextResponse.json(
      { error: 'Failed to negotiate playback' },
      { status: 500 }
    );
  }
}
