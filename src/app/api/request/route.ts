import { NextRequest, NextResponse } from 'next/server';
import { SeerrClient } from '@/lib/seerr';
import { RequestMediaPayload } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const type = (request.nextUrl.searchParams.get('type') || 'movie') as 'movie' | 'tv';
  const seerr = new SeerrClient();

  const fallbackProfiles = [
    { id: 6, name: 'HD - 720p / 1080p (Recommended)', is4k: false },
    { id: 4, name: 'HD - 1080p High Quality', is4k: false },
    { id: 5, name: '4K Ultra HD', is4k: true },
    { id: 7, name: 'WEB 1080p / 720p', is4k: false },
    { id: 3, name: '720p Standard', is4k: false },
    { id: 1, name: 'Any Quality', is4k: false },
  ];

  if (!seerr.isConfigured()) {
    return NextResponse.json({
      profiles: fallbackProfiles,
      defaultProfileId: 6,
    });
  }

  try {
    const profiles = await seerr.getQualityProfiles(type);
    return NextResponse.json({
      profiles: profiles.length > 0 ? profiles : fallbackProfiles,
      defaultProfileId: (profiles.find((p) => p.id === 6) || profiles[0] || fallbackProfiles[0]).id,
    });
  } catch {
    return NextResponse.json({
      profiles: fallbackProfiles,
      defaultProfileId: 6,
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload: RequestMediaPayload = await request.json();

    if (!payload.mediaId || !payload.mediaType) {
      return NextResponse.json(
        { success: false, error: 'mediaId and mediaType are required' },
        { status: 400 }
      );
    }

    const seerr = new SeerrClient();

    if (!seerr.isConfigured()) {
      // Simulate demo request
      return NextResponse.json({
        success: true,
        message: 'Request simulated! (Configure SEERR_URL and SEERR_API_KEY in your .env file)',
        isDemo: true,
      });
    }

    const result = await seerr.requestMedia(payload);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.message || 'Request successfully sent to Jellyseerr/Overseerr!',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
