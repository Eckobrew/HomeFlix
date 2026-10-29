import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const text = await request.text();
    if (!text) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    const body = JSON.parse(text);
    const { itemId, positionTicks, isPaused, isStopped, userId } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const profileId = userId || request.cookies.get('homeflix_profile_id')?.value;
    const jellyfin = new JellyfinClient(undefined, undefined, profileId);
    if (!jellyfin.isConfigured()) {
      return NextResponse.json({ success: false });
    }

    if (isStopped) {
      await jellyfin.reportPlaybackStopped(itemId, positionTicks || 0);
    } else {
      await jellyfin.reportPlaybackProgress(itemId, positionTicks || 0, Boolean(isPaused));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error reporting playback progress:', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
