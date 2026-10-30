import { NextRequest, NextResponse } from 'next/server';
import { SeerrClient } from '@/lib/seerr';
import { QBittorrentClient } from '@/lib/qbittorrent';
import { MOCK_SEERR_SEARCH_RESULTS, MOCK_RECENT_MOVIES, MOCK_RECENT_SERIES, MOCK_CONTINUE_WATCHING } from '@/lib/mock-data';
import { MediaItem } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  const seerr = new SeerrClient();
  const qb = new QBittorrentClient();

  if (!seerr.isConfigured()) {
    // Search mock database
    const allMock: MediaItem[] = [
      ...MOCK_SEERR_SEARCH_RESULTS,
      ...MOCK_CONTINUE_WATCHING,
      ...MOCK_RECENT_MOVIES,
      ...MOCK_RECENT_SERIES,
    ];

    const lowerQ = query.toLowerCase();
    const results = allMock.filter((item) =>
      item.title.toLowerCase().includes(lowerQ) ||
      item.overview.toLowerCase().includes(lowerQ) ||
      item.genres.some((g) => g.toLowerCase().includes(lowerQ))
    );

    // Remove duplicates by title
    const uniqueMap = new Map<string, MediaItem>();
    results.forEach((item) => uniqueMap.set(item.title, item));

    return NextResponse.json({
      results: Array.from(uniqueMap.values()),
      isDemoMode: true,
    });
  }

  try {
    const results = await seerr.search(query);

    // Cross-reference active qBittorrent downloads
    if (qb.isConfigured()) {
      try {
        const dlList = await qb.getStreamableDownloads();
        if (dlList.length > 0) {
          results.forEach((item) => {
            const matchedDl = dlList.find(
              (d) =>
                d.name.toLowerCase().includes(item.title.toLowerCase()) ||
                item.title.toLowerCase().includes(d.name.toLowerCase())
            );
            if (matchedDl) {
              item.isDownloading = true;
              item.downloadProgress = matchedDl.progressPercent;
              item.downloadSpeed = matchedDl.downloadSpeed;
              item.downloadEta = matchedDl.eta;
              item.torrentHash = matchedDl.hash;
              item.videoStreamUrl = matchedDl.streamUrl || `/api/stream/download?hash=${matchedDl.hash}`;
              item.downloadStreamUrl = matchedDl.streamUrl || `/api/stream/download?hash=${matchedDl.hash}`;
              item.status = 'processing';
            }
          });
        }
      } catch (qbErr) {
        console.warn('Failed querying qBittorrent downloads during search:', qbErr);
      }
    }

    return NextResponse.json({
      results,
      isDemoMode: false,
    });
  } catch (err: unknown) {
    console.error('Search error:', err);
    return NextResponse.json({
      results: [],
      error: 'Failed to search media in Seerr',
    }, { status: 500 });
  }
}
