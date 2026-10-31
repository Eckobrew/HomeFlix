import { withJellyfinSession } from '@/lib/jellyfin-session';
import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { resolveJellyfinUserId } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

async function handleGET(request: NextRequest) {
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
  const targetUserId = await resolveJellyfinUserId(profileId);
  const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);
  if (!jellyfin.isConfigured()) {
    return NextResponse.json(
      { error: 'Jellyfin is not configured' },
      { status: 503 }
    );
  }

  try {
    const result = await jellyfin.getPlaybackStream(itemId, {
      canPlayHevc,
      receiver: searchParams.get('receiver') === 'cast' ? 'cast' : searchParams.get('receiver') === 'browser' ? 'browser' : undefined,
      videoCodecs: (searchParams.get('videoCodecs') || '').split(',').filter(codec => ['h264', 'hevc', 'vp8', 'vp9', 'av1'].includes(codec)),
      maxWidth: searchParams.get('maxWidth') === '3840' ? 3840 : 1920,
      maxHeight: searchParams.get('maxHeight') === '2160' ? 2160 : 1080,
      audioCodecs: (searchParams.get('audioCodecs') || 'aac,mp3').split(',').filter(codec => ['aac', 'mp3', 'opus', 'flac', 'vorbis', 'ac3', 'eac3', 'dts'].includes(codec)),
      forceTranscode,
      startTimeTicks,
    });
    if (!result.streamUrl) return NextResponse.json({ error: result.error || 'Media file is not available' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to get playback stream:', error);
    return NextResponse.json(
      { error: 'Failed to negotiate playback' },
      { status: 500 }
    );
  }
}

export const GET = withJellyfinSession(handleGET);
