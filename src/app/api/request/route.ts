import { NextRequest, NextResponse } from 'next/server';
import { SeerrClient } from '@/lib/seerr';
import { RequestMediaPayload } from '@/types';

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
