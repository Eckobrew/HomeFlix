import { NextRequest, NextResponse } from 'next/server';
import { JellyfinClient } from '@/lib/jellyfin';
import { SeerrClient } from '@/lib/seerr';
import { QBittorrentClient } from '@/lib/qbittorrent';
import { getServerConfig, saveServerConfig } from '@/lib/config';
import { getHomeflixProfiles } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getServerConfig();
  const profiles = await getHomeflixProfiles();

  const isJellyfinConfigured = Boolean(config.jellyfinUrl && config.jellyfinApiKey);
  const isSeerrConfigured = Boolean(config.seerrUrl && config.seerrApiKey);
  const isQbittorrentConfigured = Boolean(config.qbittorrentUrl);
  const isSetupNeeded = !isJellyfinConfigured || profiles.length === 0;

  return NextResponse.json({
    appName: config.appName || 'HomeStream',
    jellyfinUrl: config.jellyfinUrl,
    hasJellyfinKey: Boolean(config.jellyfinApiKey),
    jellyfinUserId: config.jellyfinUserId,
    seerrUrl: config.seerrUrl,
    hasSeerrKey: Boolean(config.seerrApiKey),
    qbittorrentUrl: config.qbittorrentUrl,
    qbittorrentUsername: config.qbittorrentUsername,
    hasQbittorrentPassword: Boolean(config.qbittorrentPassword),
    downloadsPath: config.downloadsPath || '/downloads',
    isConfigured: config.isConfigured,
    isJellyfinConfigured,
    isSeerrConfigured,
    isQbittorrentConfigured,
    isSetupNeeded,
    profilesCount: profiles.length,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = request.nextUrl.searchParams.get('action') || body.action;

    if (action === 'save') {
      const saved = saveServerConfig({
        jellyfinUrl: body.jellyfinUrl,
        jellyfinApiKey: body.jellyfinApiKey,
        seerrUrl: body.seerrUrl,
        seerrApiKey: body.seerrApiKey,
        jellyfinUserId: body.jellyfinUserId,
        qbittorrentUrl: body.qbittorrentUrl,
        qbittorrentUsername: body.qbittorrentUsername,
        qbittorrentPassword: body.qbittorrentPassword,
        downloadsPath: body.downloadsPath,
      });

      return NextResponse.json({
        success: true,
        config: {
          jellyfinUrl: saved.jellyfinUrl,
          hasJellyfinKey: Boolean(saved.jellyfinApiKey),
          seerrUrl: saved.seerrUrl,
          hasSeerrKey: Boolean(saved.seerrApiKey),
          qbittorrentUrl: saved.qbittorrentUrl,
          hasQbittorrentPassword: Boolean(saved.qbittorrentPassword),
          downloadsPath: saved.downloadsPath,
          isConfigured: saved.isConfigured,
        },
      });
    }

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

    if (action === 'test-qbittorrent') {
      const client = new QBittorrentClient(body.url, body.username, body.password);
      const res = await client.testConnection();
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
