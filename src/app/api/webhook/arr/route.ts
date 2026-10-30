import { NextRequest, NextResponse } from 'next/server';
import { QBittorrentClient } from '@/lib/qbittorrent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const eventType = payload.eventType || payload.event_type || 'Unknown';
    const downloadId =
      payload.downloadId ||
      payload.download_id ||
      payload.release?.downloadId ||
      payload.release?.download_id;

    console.log(`[Arr Webhook] Received ${eventType} event. DownloadId: ${downloadId || 'none'}`);

    const client = new QBittorrentClient();
    if (!client.isConfigured()) {
      return NextResponse.json({
        success: false,
        message: 'qBittorrent is not configured',
      });
    }

    // If downloadId (torrent hash) is directly provided by the Grab event
    if (downloadId && typeof downloadId === 'string') {
      const normalizedHash = downloadId.toLowerCase();
      await client.ensureSequentialAndHeader(normalizedHash);
      console.log(`[Arr Webhook] Enforced sequential download & first/last piece priority for: ${normalizedHash}`);
      return NextResponse.json({
        success: true,
        action: 'sequential_enforced',
        hash: normalizedHash,
      });
    }

    // Fallback: iterate over all active torrents and enforce sequential on any with sonarr/radarr tags or category
    const activeTorrents = await client.getDownloadingTorrents();
    let updatedCount = 0;

    for (const t of activeTorrents) {
      const isArr =
        (t.tags && /sonarr|radarr/i.test(t.tags)) ||
        (t.category && /sonarr|radarr/i.test(t.category)) ||
        /sonarr|radarr/i.test(t.name);

      if (isArr && (!t.seq_dl || !t.f_l_piece_prio)) {
        await client.ensureSequentialAndHeader(t.hash, t.seq_dl, t.f_l_piece_prio);
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      action: 'scanned_active_downloads',
      updatedTorrents: updatedCount,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[Arr Webhook] Error processing webhook:', err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'online',
    description: 'HomeStream Sonarr/Radarr Webhook receiver for automatic sequential torrent downloads',
  });
}
