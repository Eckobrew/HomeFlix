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

  async getPopularMovies(page = 1): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const res = await fetch(`${this.url}/api/v1/discover/movies?page=${page}`, {
        headers: this.getHeaders(),
        next: { revalidate: 300 },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results: SeerrResult[] = (data.results || []).filter(
        (r: SeerrResult) => r.mediaType === 'movie' || !r.mediaType
      );
      return results.map((r) => this.mapResult({ ...r, mediaType: 'movie' }));
    } catch (e) {
      console.error('Error fetching popular movies from Seerr:', e);
      return [];
    }
  }

  async getPopularTv(page = 1): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const res = await fetch(`${this.url}/api/v1/discover/tv?page=${page}`, {
        headers: this.getHeaders(),
        next: { revalidate: 300 },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results: SeerrResult[] = (data.results || []).filter(
        (r: SeerrResult) => r.mediaType === 'tv' || !r.mediaType
      );
      return results.map((r) => this.mapResult({ ...r, mediaType: 'tv' }));
    } catch (e) {
      console.error('Error fetching popular TV from Seerr:', e);
      return [];
    }
  }

  async getDiscoverByGenre(genreId: number, mediaType: 'movie' | 'tv' = 'movie', page = 1): Promise<MediaItem[]> {
    if (!this.isConfigured() || !genreId) return [];
    try {
      const endpoint = mediaType === 'tv' ? 'tv' : 'movies';
      const res = await fetch(`${this.url}/api/v1/discover/${endpoint}?genre=${genreId}&page=${page}`, {
        headers: this.getHeaders(),
        next: { revalidate: 300 },
      });
      if (!res.ok) return [];
      const data = await res.json();
      const results: SeerrResult[] = data.results || [];
      return results.map((r) => this.mapResult({ ...r, mediaType }));
    } catch (e) {
      console.error(`Error discovering ${mediaType} with genre ${genreId}:`, e);
      return [];
    }
  }

  async getRecommendationsForGenres(genres: string[], limit = 20): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];

    const MOVIE_GENRES: Record<string, number> = {
      action: 28,
      adventure: 12,
      animation: 16,
      comedy: 35,
      crime: 80,
      documentary: 99,
      drama: 18,
      family: 10751,
      fantasy: 14,
      history: 36,
      horror: 27,
      music: 10402,
      mystery: 9648,
      romance: 10749,
      'science fiction': 878,
      'sci-fi': 878,
      scifi: 878,
      thriller: 53,
      war: 10752,
      western: 37,
    };

    const TV_GENRES: Record<string, number> = {
      'action & adventure': 10759,
      action: 10759,
      adventure: 10759,
      animation: 16,
      comedy: 35,
      crime: 80,
      documentary: 99,
      drama: 18,
      family: 10751,
      kids: 10762,
      mystery: 9648,
      news: 10763,
      reality: 10764,
      'sci-fi & fantasy': 10765,
      'sci-fi': 10765,
      scifi: 10765,
      'science fiction': 10765,
      fantasy: 10765,
      soap: 10766,
      talk: 10767,
      'war & politics': 10768,
      western: 37,
    };

    // If no watched genres available, fallback to top trending mix
    if (!genres || genres.length === 0) {
      return this.getTrending();
    }

    // Take top 3 genres from watch history
    const topGenres = genres.slice(0, 3);
    const fetchPromises: Promise<MediaItem[]>[] = [];

    for (const g of topGenres) {
      const normalized = g.toLowerCase().trim();
      const movieGenreId = MOVIE_GENRES[normalized];
      const tvGenreId = TV_GENRES[normalized];

      if (movieGenreId) {
        fetchPromises.push(this.getDiscoverByGenre(movieGenreId, 'movie'));
      }
      if (tvGenreId) {
        fetchPromises.push(this.getDiscoverByGenre(tvGenreId, 'tv'));
      }
    }

    if (fetchPromises.length === 0) {
      return this.getTrending();
    }

    try {
      const batches = await Promise.all(fetchPromises);
      const combined: MediaItem[] = [];
      const seenIds = new Set<string>();

      // Interleave items from each genre batch to provide a balanced recommendation
      const maxLength = Math.max(...batches.map((b) => b.length));
      for (let i = 0; i < maxLength; i++) {
        for (const batch of batches) {
          if (batch[i] && !seenIds.has(batch[i].id)) {
            seenIds.add(batch[i].id);
            combined.push(batch[i]);
            if (combined.length >= limit) break;
          }
        }
        if (combined.length >= limit) break;
      }

      return combined.length > 0 ? combined : this.getTrending();
    } catch (e) {
      console.error('Error building genre recommendations:', e);
      return this.getTrending();
    }
  }

  async getQualityProfiles(mediaType: 'movie' | 'tv' = 'movie'): Promise<{ id: number; name: string; is4k?: boolean }[]> {
    if (!this.isConfigured()) return [];
    try {
      const service = mediaType === 'tv' ? 'sonarr' : 'radarr';
      const srvRes = await fetch(`${this.url}/api/v1/service/${service}`, {
        headers: this.getHeaders(),
        next: { revalidate: 600 },
      });
      if (!srvRes.ok) return [];
      const servers = await srvRes.json();
      if (!Array.isArray(servers) || servers.length === 0) return [];
      const defaultServer = servers.find((s) => s.isDefault) || servers[0];

      const profRes = await fetch(`${this.url}/api/v1/service/${service}/${defaultServer.id}`, {
        headers: this.getHeaders(),
        next: { revalidate: 600 },
      });
      if (!profRes.ok) return [];
      const serverDetails = await profRes.json();
      const profiles: { id: number; name: string }[] = serverDetails.profiles || [];

      return profiles.map((p) => ({
        id: p.id,
        name: p.name,
        is4k: p.name.toLowerCase().includes('4k') || p.name.toLowerCase().includes('ultra'),
      }));
    } catch (e) {
      console.error(`Error fetching quality profiles for ${mediaType}:`, e);
      return [];
    }
  }

  async requestMedia(payload: RequestMediaPayload): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Seerr is not configured' };
    }

    try {
      const is4k = Boolean(payload.is4k);
      const body: Record<string, unknown> = {
        mediaType: payload.mediaType,
        mediaId: payload.mediaId,
        is4k,
      };

      if (typeof payload.profileId === 'number') {
        body.profileId = payload.profileId;
      }
      if (typeof payload.serverId === 'number') {
        body.serverId = payload.serverId;
      }

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
