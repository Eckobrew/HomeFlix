import { NextResponse } from 'next/server';
import { QBittorrentClient } from '@/lib/qbittorrent';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const client = new QBittorrentClient();
    if (!client.isConfigured()) {
      return NextResponse.json({
        configured: false,
        items: [],
      });
    }

    const items = await client.getStreamableDownloads();

    return NextResponse.json({
      configured: true,
      items,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Failed to get torrent downloads:', err);
    return NextResponse.json(
      { configured: false, error: errorMsg, items: [] },
      { status: 500 }
    );
  }
}
