import { withJellyfinSession } from '@/lib/jellyfin-session';
import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { getServerConfig } from '@/lib/config';
import { requestJellyfinSession } from '@/lib/jellyfin-session';
import { resolveJellyfinUserId } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

async function handleGET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get('itemId');
  const ticksParam = searchParams.get('ticks');
  const startTimeTicks = ticksParam ? Number(ticksParam) : undefined;

  if (!itemId) {
    return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
  }

  const profileId =
    searchParams.get('userId') ||
    request.cookies.get('homeflix_profile_id')?.value;
  const targetUserId = await resolveJellyfinUserId(profileId);
  const jellyfin = new JellyfinClient(undefined, undefined, targetUserId);

  if (!jellyfin.isConfigured()) {
    return NextResponse.json({ error: 'Jellyfin not configured' }, { status: 503 });
  }

  const config = getServerConfig();
  const jellyfinUrl = (config.jellyfinUrl || '').replace(/\/+$/, '');
  const apiKey = requestJellyfinSession()?.accessToken || config.jellyfinApiKey;

  try {
    const uid = targetUserId || (await jellyfin.getFirstUserId());

    const profilePayload = {
      StartTimeTicks: startTimeTicks && startTimeTicks > 0 ? startTimeTicks : undefined,
      DeviceProfile: {
        MaxStreamingBitrate: 80000000,
        DirectPlayProfiles: [
          {
            Container: 'mp4,m4v,mov',
            Type: 'Video',
            VideoCodec: 'h264',
            AudioCodec: 'aac,mp3',
          },
        ],
        TranscodingProfiles: [
          {
            Container: 'mp4',
            Type: 'Video',
            VideoCodec: 'h264',
            AudioCodec: 'aac',
            Protocol: 'http',
            Context: 'Streaming',
          },
        ],
      },
    };

    const startTimeParam =
      startTimeTicks && startTimeTicks > 0 ? `&StartTimeTicks=${startTimeTicks}` : '';

    const res = await fetch(
      `${jellyfinUrl}/Items/${itemId}/PlaybackInfo?UserId=${uid}${startTimeParam}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `MediaBrowser Client="${config.appName || 'HomeStream'}", Device="Web", DeviceId="homeflix-web", Version="1.0.0", Token="${apiKey}"`,
        },
        body: JSON.stringify(profilePayload),
      }
    );

    if (res.ok) {
      const data = await res.json();
      const mediaSource = data.MediaSources?.[0];

      if (mediaSource) {
        // 1. Transcoding required (AVI, MKV, non-h264, etc.)
        if (mediaSource.TranscodingUrl) {
          const transcodeUrl = `${jellyfinUrl}${mediaSource.TranscodingUrl}`;
          return NextResponse.redirect(transcodeUrl, 302);
        }

        // 2. Direct Stream available
        if (mediaSource.DirectStreamUrl) {
          const directStreamUrl = `${jellyfinUrl}${mediaSource.DirectStreamUrl}`;
          return NextResponse.redirect(directStreamUrl, 302);
        }

        // 3. Native MP4 DirectPlay
        if (mediaSource.SupportsDirectPlay) {
          const directUrl = `${jellyfinUrl}/Videos/${itemId}/stream.mp4?api_key=${apiKey}&Static=true`;
          return NextResponse.redirect(directUrl, 302);
        }
      }
    }
  } catch (err) {
    console.error(`Failed to negotiate preview stream for item ${itemId}:`, err);
  }

  // Fallback: standard static/direct stream
  const fallbackUrl = `${jellyfinUrl}/Videos/${itemId}/stream.mp4?api_key=${apiKey}&Static=true`;
  return NextResponse.redirect(fallbackUrl, 302);
}

export const GET = withJellyfinSession(handleGET);
