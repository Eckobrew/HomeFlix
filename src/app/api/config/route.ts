import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getServerConfig();
  return NextResponse.json({
    jellyfinUrl: config.jellyfinUrl,
    hasJellyfinKey: Boolean(config.jellyfinApiKey),
    jellyfinUserId: config.jellyfinUserId,
    seerrUrl: config.seerrUrl,
    hasSeerrKey: Boolean(config.seerrApiKey),
    isConfigured: config.isConfigured,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get('action') || body.action;

    if (action === 'test-jellyfin') {
      const client = new JellyfinClient(body.url, body.apiKey, body.userId);
      const res = await client.testConnection();
      return NextResponse.json(res);
    }

    if (action === 'test-seerr') {
      const client = new SeerrClient(body.url, body.apiKey);
      const res = await client.testConnection();
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
