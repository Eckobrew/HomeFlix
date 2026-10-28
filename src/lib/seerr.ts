import { MediaItem, AvailabilityStatus, RequestMediaPayload } from '@/types';
import { getServerConfig } from './config';

export interface SeerrResult {
  id: number;
  mediaType: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview?: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage?: number;
  genreIds?: number[];
  mediaInfo?: {
    id: number;
    tmdbId: number;
    tvdbId?: number;
    status: number; // 1 = UNKNOWN, 2 = PENDING, 3 = PROCESSING, 4 = PARTIALLY_AVAILABLE, 5 = AVAILABLE
    requests?: { id: number; status: number }[];
  };
}

export class SeerrClient {
  private url: string;
  private apiKey: string;

  constructor(url?: string, apiKey?: string) {
    const config = getServerConfig();
    this.url = (url || config.seerrUrl).replace(/\/+$/, '');
    this.apiKey = apiKey || config.seerrApiKey;
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.apiKey);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Api-Key': this.apiKey,
    };
  }

  async testConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Seerr URL and API key are required' };
    }

    try {
      const res = await fetch(`${this.url}/api/v1/status`, {
        headers: this.getHeaders(),
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json();
      return {
        success: true,
        version: data.version || 'Connected',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  private mapStatus(mediaInfoStatus?: number): AvailabilityStatus {
    switch (mediaInfoStatus) {
      case 5:
        return 'available';
      case 4:
        return 'partially_available';
      case 3:
        return 'processing';
      case 2:
        return 'requested';
      default:
        return 'not_requested';
    }
  }

  private mapResult(item: SeerrResult): MediaItem {
    const isTv = item.mediaType === 'tv';
    const title = item.title || item.name || 'Untitled';
    const relDate = item.releaseDate || item.firstAirDate;
    const year = relDate ? new Date(relDate).getFullYear() : undefined;

    const posterUrl = item.posterPath
      ? `https://image.tmdb.org/t/p/w500${item.posterPath}`
      : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80';

    const backdropUrl = item.backdropPath
      ? `https://image.tmdb.org/t/p/original${item.backdropPath}`
      : posterUrl;

    const status = this.mapStatus(item.mediaInfo?.status);

    return {
      id: `seerr-${item.id}`,
      title,
      overview: item.overview || 'No description available.',
      type: isTv ? 'Series' : 'Movie',
      posterUrl,
      backdropUrl,
      year,
      releaseDate: relDate,
      rating: isTv ? 'TV-MA' : 'PG-13',
      matchPercentage: item.voteAverage ? Math.round(item.voteAverage * 10) : 90,
      communityRating: item.voteAverage,
      genres: [],
      source: 'seerr',
      tmdbId: item.id,
      seerrId: item.mediaInfo?.id,
      status,
    };
  }

  async search(query: string, page = 1): Promise<MediaItem[]> {
    if (!this.isConfigured() || !query.trim()) return [];
    try {
      const res = await fetch(
        `${this.url}/api/v1/search?query=${encodeURIComponent(query)}&page=${page}`,
        { headers: this.getHeaders() }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const results: SeerrResult[] = (data.results || []).filter(
        (r: SeerrResult) => r.mediaType === 'movie' || r.mediaType === 'tv'
      );
      return results.map((r) => this.mapResult(r));
    } catch (e) {
      console.error('Error searching media in Seerr:', e);
      return [];
    }
  }

  async getTrending(): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const res = await fetch(`${this.url}/api/v1/discover/trending`, {
        headers: this.getHeaders(),
        next: { revalidate: 300 },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results: SeerrResult[] = (data.results || []).filter(
        (r: SeerrResult) => r.mediaType === 'movie' || r.mediaType === 'tv'
      );
      return results.map((r) => this.mapResult(r));
    } catch (e) {
      console.error('Error fetching trending from Seerr:', e);
      return [];
    }
  }

  async requestMedia(payload: RequestMediaPayload): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Seerr is not configured' };
    }

    try {
      const body: Record<string, unknown> = {
        mediaType: payload.mediaType,
        mediaId: payload.mediaId,
      };

      if (payload.mediaType === 'tv') {
        body.seasons = payload.seasons && payload.seasons.length > 0 ? payload.seasons : 'all';
      }

      const res = await fetch(`${this.url}/api/v1/request`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        const errMsg = errJson?.message || `HTTP ${res.status}: ${res.statusText}`;
        return { success: false, error: errMsg };
      }

      return { success: true, message: 'Request submitted successfully to Sonarr / Radarr!' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }
}
