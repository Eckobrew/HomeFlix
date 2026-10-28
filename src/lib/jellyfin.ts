import { MediaItem, Season, Episode } from '@/types';
import { getServerConfig } from './config';

export interface JellyfinItem {
  Id: string;
  Name: string;
  OriginalTitle?: string;
  Overview?: string;
  Type: 'Movie' | 'Series' | 'Episode';
  ProductionYear?: number;
  PremiereDate?: string;
  OfficialRating?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  Genres?: string[];
  ChildCount?: number; // Season count for Series
  UserData?: {
    PlaybackPositionTicks?: number;
    Played?: boolean;
    IsFavorite?: boolean;
  };
  People?: { Name: string; Role: string; Type: string }[];
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
    Thumb?: string;
  };
  BackdropImageTags?: string[];
  IndexNumber?: number; // Episode or Season number
  ParentIndexNumber?: number; // Season number for episode
  SeriesName?: string;
  SeriesId?: string;
  SeasonId?: string;
}

export class JellyfinClient {
  private url: string;
  private apiKey: string;
  private userId: string;

  constructor(url?: string, apiKey?: string, userId?: string) {
    const config = getServerConfig();
    this.url = (url || config.jellyfinUrl).replace(/\/+$/, '');
    this.apiKey = apiKey || config.jellyfinApiKey;
    this.userId = userId || config.jellyfinUserId;
  }

  isConfigured(): boolean {
    return Boolean(this.url && this.apiKey);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Accept': 'application/json',
      'X-Emby-Token': this.apiKey,
      'Authorization': `MediaBrowser Client="HomeFlix", Device="Web", DeviceId="homeflix-web", Version="1.0.0", Token="${this.apiKey}"`,
    };
  }

  async testConnection(): Promise<{ success: boolean; serverName?: string; version?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Jellyfin URL and API key are required' };
    }

    try {
      const res = await fetch(`${this.url}/System/Info/Public`, {
        headers: this.getHeaders(),
        next: { revalidate: 0 },
      });

      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json();
      return {
        success: true,
        serverName: data.ServerName || 'Jellyfin Server',
        version: data.Version,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }

  async getFirstUserId(): Promise<string> {
    if (this.userId) return this.userId;
    try {
      const res = await fetch(`${this.url}/Users`, {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const users = await res.json();
        if (Array.isArray(users) && users.length > 0) {
          this.userId = users[0].Id;
          return users[0].Id;
        }
      }
    } catch (e) {
      console.error('Failed to get Jellyfin users', e);
    }
    return '';
  }

  getImageUrl(itemId: string, type: 'Primary' | 'Backdrop' | 'Thumb' = 'Primary', maxWidth = 800): string {
    if (!this.url || !itemId) return '';
    return `${this.url}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}&quality=90`;
  }

  getStreamUrl(itemId: string): string {
    if (!this.url || !itemId) return '';
    return `${this.url}/Videos/${itemId}/stream?static=true&api_key=${this.apiKey}`;
  }

  getJellyfinWebPlayerUrl(itemId: string): string {
    if (!this.url || !itemId) return '';
    return `${this.url}/web/index.html#!/details?id=${itemId}`;
  }

  private mapJellyfinItem(item: JellyfinItem): MediaItem {
    const isSeries = item.Type === 'Series';
    const isEpisode = item.Type === 'Episode';
    const isMovie = item.Type === 'Movie';

    const posterUrl = this.getImageUrl(item.Id, 'Primary', 600);
    const backdropUrl = (item.BackdropImageTags && item.BackdropImageTags.length > 0)
      ? this.getImageUrl(item.Id, 'Backdrop', 1920)
      : posterUrl;

    const playbackTicks = item.UserData?.PlaybackPositionTicks || 0;
    const totalTicks = item.RunTimeTicks || 0;
    const progressPercent = totalTicks > 0 ? Math.round((playbackTicks / totalTicks) * 100) : 0;

    const durationMinutes = totalTicks > 0 ? Math.round(totalTicks / (10000 * 1000 * 60)) : undefined;

    return {
      id: item.Id,
      title: item.Name,
      originalTitle: item.OriginalTitle,
      overview: item.Overview || 'No description available.',
      type: isSeries ? 'Series' : isEpisode ? 'Episode' : 'Movie',
      posterUrl,
      backdropUrl,
      year: item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : undefined),
      releaseDate: item.PremiereDate,
      rating: item.OfficialRating || (isSeries ? 'TV-MA' : 'PG-13'),
      matchPercentage: item.CommunityRating ? Math.round(item.CommunityRating * 10 + 5) : 95,
      communityRating: item.CommunityRating,
      durationMinutes,
      genres: item.Genres || [],
      seasonsCount: item.ChildCount,
      source: 'jellyfin',
      jellyfinId: item.Id,
      status: 'available',
      playbackPositionTicks: playbackTicks,
      totalDurationTicks: totalTicks,
      progressPercent,
      cast: item.People?.map((p) => ({
        name: p.Name,
        role: p.Role || p.Type,
      })),
      videoStreamUrl: isMovie || isEpisode ? this.getStreamUrl(item.Id) : undefined,
    };
  }

  async getResumeItems(): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/UserItems/Resume?userId=${uid}&Limit=12&Fields=Overview,Genres,OfficialRating,CommunityRating,People`,
        { headers: this.getHeaders(), next: { revalidate: 30 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.Items || []).map((item: JellyfinItem) => this.mapJellyfinItem(item));
    } catch (e) {
      console.error('Error fetching resume items from Jellyfin:', e);
      return [];
    }
  }

  async getLatestMedia(type: 'Movie' | 'Series', limit = 15): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Users/${uid}/Items?IncludeItemTypes=${type}&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount`,
        { headers: this.getHeaders(), next: { revalidate: 60 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.Items || []).map((item: JellyfinItem) => this.mapJellyfinItem(item));
    } catch (e) {
      console.error(`Error fetching latest ${type} from Jellyfin:`, e);
      return [];
    }
  }

  async getTopRated(limit = 10): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Users/${uid}/Items?IncludeItemTypes=Movie,Series&SortBy=CommunityRating&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount`,
        { headers: this.getHeaders(), next: { revalidate: 120 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data.Items || []).map((item: JellyfinItem) => this.mapJellyfinItem(item));
    } catch (e) {
      console.error('Error fetching top rated from Jellyfin:', e);
      return [];
    }
  }

  async getItemDetails(itemId: string): Promise<MediaItem | null> {
    if (!this.isConfigured()) return null;
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Users/${uid}/Items/${itemId}?Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks`,
        { headers: this.getHeaders() }
      );
      if (!res.ok) return null;
      const data: JellyfinItem = await res.json();
      const media = this.mapJellyfinItem(data);

      if (data.Type === 'Series') {
        media.seasons = await this.getSeriesSeasons(itemId);
      }

      return media;
    } catch (e) {
      console.error('Error fetching item details from Jellyfin:', e);
      return null;
    }
  }

  async getSeriesSeasons(seriesId: string): Promise<Season[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Shows/${seriesId}/Seasons?userId=${uid}&Fields=Overview,ItemCounts`,
        { headers: this.getHeaders() }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const seasons: Season[] = [];

      for (const s of data.Items || []) {
        // Fetch episodes for season
        const epRes = await fetch(
          `${this.url}/Shows/${seriesId}/Episodes?seasonId=${s.Id}&userId=${uid}&Fields=Overview,RunTimeTicks,IndexNumber`,
          { headers: this.getHeaders() }
        );
        let episodes: Episode[] = [];
        if (epRes.ok) {
          const epData = await epRes.json();
          episodes = (epData.Items || []).map((ep: JellyfinItem) => ({
            id: ep.Id,
            episodeNumber: ep.IndexNumber || 1,
            seasonNumber: s.IndexNumber || 1,
            name: ep.Name,
            overview: ep.Overview || 'No description available.',
            durationMinutes: ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / (10000 * 1000 * 60)) : 45,
            thumbnailUrl: this.getImageUrl(ep.Id, 'Primary', 400),
            jellyfinId: ep.Id,
          }));
        }

        seasons.push({
          id: s.Id,
          seasonNumber: s.IndexNumber || 1,
          name: s.Name || `Season ${s.IndexNumber}`,
          episodeCount: episodes.length,
          overview: s.Overview,
          episodes,
        });
      }

      return seasons;
    } catch (e) {
      console.error('Error fetching seasons from Jellyfin:', e);
      return [];
    }
  }
}
