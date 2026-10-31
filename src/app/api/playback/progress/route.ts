import { withJellyfinSession } from '@/lib/jellyfin-session';
import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { resolveJellyfinUserId } from '@/lib/profiles';
import { readSession } from '@/lib/session';
import { isRequestLocalOrTailscale } from '@/lib/network';

export const dynamic = 'force-dynamic';

async function handlePOST(request: NextRequest) {
  try {
    const text = await request.text();
    if (!text) {
      return NextResponse.json({ success: false }, { status: 400 });
    }
    const body = JSON.parse(text);
    const { itemId, positionTicks, isPaused, isStopped, isStarted, userId } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const session = await readSession(request.cookies.get('homeflix_session')?.value, 'web');
    const profileId = session && !isRequestLocalOrTailscale(request).isLocalOrTailscale ? session.id : userId || request.cookies.get('homeflix_profile_id')?.value;
    const targetUserId = await resolveJellyfinUserId(profileId);
    const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);
    if (!jellyfin.isConfigured()) {
      return NextResponse.json({ success: false });
    }

    if (isStarted) {
      await jellyfin.reportPlaybackStarted(itemId, positionTicks || 0, Boolean(isPaused));
    } else if (isStopped) {
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

export const POST = withJellyfinSession(handlePOST);
