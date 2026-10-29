import { MediaItem, Season, Episode, SubtitleTrack, UserProfile } from '@/types';
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
  LocationType?: string;
  Container?: string;
  Width?: number;
  Height?: number;
  MediaStreams?: {
    Type?: string;
    Index?: number;
    Codec?: string;
    Language?: string;
    Title?: string;
    DisplayTitle?: string;
    IsDefault?: boolean;
    IsForced?: boolean;
    Width?: number;
    Height?: number;
    Channels?: number;
    ChannelLayout?: string;
    VideoRange?: string;
    VideoRangeType?: string;
    AudioSpatialFormat?: string;
  }[];
  MediaSources?: {
    Id?: string;
    Path?: string;
    MediaStreams?: {
      Type?: string;
      Width?: number;
      Height?: number;
      Channels?: number;
      ChannelLayout?: string;
      VideoRange?: string;
      VideoRangeType?: string;
      DisplayTitle?: string;
      AudioSpatialFormat?: string;
      IsDefault?: boolean;
      IsForced?: boolean;
    }[];
  }[];
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

  getUserImageUrl(userId: string): string {
    if (!this.url || !userId) return '';
    return `${this.url}/Users/${userId}/Images/Primary?quality=90`;
  }

  async findUserByName(name: string): Promise<{ id: string; name: string } | null> {
    if (!this.isConfigured() || !name) return null;
    try {
      const res = await fetch(`${this.url}/Users`, {
        headers: this.getHeaders(),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const users = await res.json();
      if (!Array.isArray(users)) return null;
      const target = users.find(
        (u: any) => (u.Name || '').trim().toLowerCase() === name.trim().toLowerCase()
      );
      if (target) {
        return { id: target.Id, name: target.Name };
      }
      return null;
    } catch (e) {
      console.error('Error finding Jellyfin user by name:', e);
      return null;
    }
  }

  async createUser(name: string): Promise<{ id: string; name: string } | null> {
    if (!this.isConfigured() || !name) return null;
    try {
      const res = await fetch(`${this.url}/Users/New`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Name: name.trim() }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Failed to create Jellyfin user (${res.status}):`, text);
        return null;
      }
      const data = await res.json();
      return { id: data.Id, name: data.Name };
    } catch (e) {
      console.error('Error creating Jellyfin user:', e);
      return null;
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    if (!this.isConfigured() || !userId) return false;
    try {
      const res = await fetch(`${this.url}/Users/${userId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      return res.ok;
    } catch (e) {
      console.error('Error deleting Jellyfin user:', e);
      return false;
    }
  }

  async getUsers(): Promise<UserProfile[]> {
    if (!this.isConfigured()) {
      return [
        {
          id: 'mock-nathan',
          name: 'Nathan',
          avatarColor: 'from-red-600 to-red-800',
          avatarBg: 'bg-red-600',
          initials: 'NA',
          isAdministrator: true,
        },
        {
          id: 'mock-mirelle',
          name: 'Mirelle',
          avatarColor: 'from-purple-600 to-pink-600',
          avatarBg: 'bg-purple-600',
          initials: 'MI',
          isAdministrator: false,
        },
      ];
    }

    try {
      const res = await fetch(`${this.url}/Users`, {
        headers: this.getHeaders(),
        next: { revalidate: 60 },
      });

      if (!res.ok) {
        return [];
      }

      const rawUsers = await res.json();
      if (!Array.isArray(rawUsers)) return [];

      const palettes = [
        { avatarColor: 'from-red-600 to-red-800', avatarBg: 'bg-red-600' },
        { avatarColor: 'from-purple-600 to-pink-600', avatarBg: 'bg-purple-600' },
        { avatarColor: 'from-sky-500 to-blue-700', avatarBg: 'bg-blue-600' },
        { avatarColor: 'from-emerald-500 to-teal-700', avatarBg: 'bg-emerald-600' },
        { avatarColor: 'from-amber-500 to-orange-700', avatarBg: 'bg-amber-600' },
        { avatarColor: 'from-rose-500 to-red-700', avatarBg: 'bg-rose-600' },
        { avatarColor: 'from-indigo-500 to-purple-700', avatarBg: 'bg-indigo-600' },
      ];

      return rawUsers.map((u: any, idx: number) => {
        const lowerName = (u.Name || '').toLowerCase();
        let palette = palettes[idx % palettes.length];

        if (lowerName.includes('nathan')) {
          palette = palettes[0]; // Red
        } else if (lowerName.includes('mirelle')) {
          palette = palettes[1]; // Purple/Pink
        } else if (lowerName.includes('david')) {
          palette = palettes[2]; // Sky/Blue
        } else if (lowerName.includes('harry')) {
          palette = palettes[3]; // Emerald
        } else if (lowerName.includes('messy')) {
          palette = palettes[4]; // Amber
        }

        const initials = (u.Name || 'HF')
          .trim()
          .split(/\s+/)
          .map((n: string) => n[0])
          .join('')
          .slice(0, 2)
          .toUpperCase() || 'HF';

        return {
          id: u.Id,
          name: u.Name,
          avatarColor: palette.avatarColor,
          avatarBg: palette.avatarBg,
          initials,
          avatarUrl: u.PrimaryImageTag ? `${this.url}/Users/${u.Id}/Images/Primary` : undefined,
          isAdministrator: Boolean(u.Policy?.IsAdministrator),
        };
      });
    } catch (e) {
      console.error('Error fetching Jellyfin users:', e);
      return [];
    }
  }

  getImageUrl(itemId: string, type: 'Primary' | 'Backdrop' | 'Thumb' = 'Primary', maxWidth = 800): string {
    if (!this.url || !itemId) return '';
    return `${this.url}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}&quality=90`;
  }

  getStreamUrl(itemId: string): string {
    if (!this.url || !itemId) return '';
    return `${this.url}/Videos/${itemId}/stream.mp4?api_key=${this.apiKey}`;
  }

  async getPlaybackStream(
    itemId: string,
    options?: {
      canPlayHevc?: boolean;
      forceTranscode?: boolean;
      startTimeTicks?: number;
    }
  ): Promise<{
    streamUrl: string;
    isTranscoding: boolean;
    transcodeReasons?: string;
    playSessionId?: string;
    mediaSourceId?: string;
    totalDurationTicks?: number;
    durationSeconds?: number;
  }> {
    if (!this.isConfigured() || !itemId) {
      return {
        streamUrl: '',
        isTranscoding: false,
      };
    }

    try {
      const uid = await this.getFirstUserId();
      const startTimeTicksParam =
        typeof options?.startTimeTicks === 'number' && options.startTimeTicks > 0
          ? `&StartTimeTicks=${options.startTimeTicks}`
          : '';

      const canDirectHevc = Boolean(options?.canPlayHevc && !options?.forceTranscode);
      const directVideoCodecs = options?.forceTranscode
        ? ''
        : canDirectHevc
        ? 'h264,hevc'
        : 'h264';

      const directPlayProfiles = directVideoCodecs
        ? [
            {
              Container: 'mp4,m4v,mov',
              Type: 'Video',
              VideoCodec: directVideoCodecs,
              AudioCodec: 'aac,mp3',
            },
          ]
        : [];

      const profilePayload = {
        StartTimeTicks: options?.startTimeTicks,
        DeviceProfile: {
          MaxStreamingBitrate: 120000000,
          DirectPlayProfiles: directPlayProfiles,
          TranscodingProfiles: [
            {
              Container: 'ts',
              Type: 'Video',
              VideoCodec: 'h264',
              AudioCodec: 'aac',
              Protocol: 'hls',
              Context: 'Streaming',
            },
            {
              Container: 'mp4',
              Type: 'Video',
              VideoCodec: 'h264',
              AudioCodec: 'aac',
              Protocol: 'http',
              Context: 'Streaming',
            },
          ],
        },
      };

      const res = await fetch(
        `${this.url}/Items/${itemId}/PlaybackInfo?UserId=${uid}${startTimeTicksParam}`,
        {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(profilePayload),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const mediaSource = data.MediaSources?.[0];
        if (mediaSource) {
          let totalDurationTicks = mediaSource.RunTimeTicks;
          if (!totalDurationTicks || totalDurationTicks <= 0) {
            const itemDetails = await this.getItemDetails(itemId);
            if (itemDetails?.totalDurationTicks) {
              totalDurationTicks = itemDetails.totalDurationTicks;
            }
          }
          const durationSeconds = typeof totalDurationTicks === 'number' && totalDurationTicks > 0
            ? totalDurationTicks / 10000000
            : undefined;

          if (mediaSource.TranscodingUrl) {
            return {
              streamUrl: `${this.url}${mediaSource.TranscodingUrl}`,
              isTranscoding: true,
              transcodeReasons: mediaSource.TranscodeReasons?.join(', '),
              playSessionId: data.PlaySessionId,
              mediaSourceId: mediaSource.Id,
              totalDurationTicks,
              durationSeconds,
            };
          }

          if (mediaSource.DirectStreamUrl) {
            return {
              streamUrl: `${this.url}${mediaSource.DirectStreamUrl}`,
              isTranscoding: false,
              playSessionId: data.PlaySessionId,
              mediaSourceId: mediaSource.Id,
              totalDurationTicks,
              durationSeconds,
            };
          }

          if (mediaSource.SupportsDirectPlay) {
            return {
              streamUrl: `${this.url}/Videos/${itemId}/stream.mp4?api_key=${this.apiKey}`,
              isTranscoding: false,
              playSessionId: data.PlaySessionId,
              mediaSourceId: mediaSource.Id,
              totalDurationTicks,
              durationSeconds,
            };
          }
        }
      }
    } catch (e) {
      console.error(`Error negotiating playback for item ${itemId}:`, e);
    }

    return {
      streamUrl: `${this.url}/Videos/${itemId}/stream.mp4?api_key=${this.apiKey}`,
      isTranscoding: false,
    };
  }

  async reportPlaybackProgress(itemId: string, positionTicks: number, isPaused = false): Promise<boolean> {
    if (!this.isConfigured() || !itemId) return false;
    try {
      const uid = await this.getFirstUserId();
      await fetch(`${this.url}/Sessions/Playing/Progress`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ItemId: itemId,
          UserId: uid,
          PositionTicks: positionTicks,
          IsPaused: isPaused,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  async reportPlaybackStopped(itemId: string, positionTicks: number): Promise<boolean> {
    if (!this.isConfigured() || !itemId) return false;
    try {
      const uid = await this.getFirstUserId();
      await fetch(`${this.url}/Sessions/Playing/Stopped`, {
        method: 'POST',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ItemId: itemId,
          UserId: uid,
          PositionTicks: positionTicks,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  getSubtitleStreamUrl(itemId: string, mediaSourceId: string, index: number): string {
    if (!this.url || !itemId) return '';
    const sourceId = mediaSourceId || itemId;
    return `${this.url}/Videos/${itemId}/${sourceId}/Subtitles/${index}/0/Stream.vtt?api_key=${this.apiKey}`;
  }

  async getSubtitles(itemId: string): Promise<SubtitleTrack[]> {
    if (!this.isConfigured() || !itemId) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Users/${uid}/Items/${itemId}?Fields=MediaStreams,MediaSources`,
        { headers: this.getHeaders() }
      );
      if (!res.ok) return [];
      const data: JellyfinItem = await res.json();
      const mediaSourceId = data.MediaSources?.[0]?.Id || itemId;
      const subStreams = (data.MediaStreams || []).filter(
        (s) => s.Type === 'Subtitle' && typeof s.Index === 'number'
      );

      return subStreams.map((s) => ({
        id: String(s.Index),
        index: s.Index!,
        title: s.DisplayTitle || s.Title || s.Language || `Subtitle ${s.Index}`,
        language: s.Language || 'und',
        isDefault: Boolean(s.IsDefault),
        isForced: Boolean(s.IsForced),
        src: `/api/subtitles?itemId=${itemId}&mediaSourceId=${mediaSourceId}&index=${s.Index}`,
      }));
    } catch (e) {
      console.error(`Error fetching subtitles for item ${itemId}:`, e);
      return [];
    }
  }

  private parseMediaQuality(item: JellyfinItem): {
    resolution?: string;
    videoQuality?: string;
    audioQuality?: string;
    hasHdr?: boolean;
  } {
    const streams = item.MediaStreams || item.MediaSources?.[0]?.MediaStreams || [];
    const videoStream = streams.find((s) => s.Type === 'Video');
    const audioStream =
      streams.find((s) => s.Type === 'Audio' && s.IsDefault) ||
      streams.find((s) => s.Type === 'Audio');

    const width = videoStream?.Width || item.Width || 0;
    const height = videoStream?.Height || item.Height || 0;
    const videoTitle = (videoStream?.DisplayTitle || '').toLowerCase();
    const path = (item.MediaSources?.[0]?.Path || '').toLowerCase();

    let resolution: string | undefined;
    let videoQuality: string | undefined;

    if (
      width >= 3800 ||
      height >= 2000 ||
      videoTitle.includes('4k') ||
      videoTitle.includes('2160p') ||
      path.includes('4k') ||
      path.includes('2160p') ||
      path.includes('uhd')
    ) {
      resolution = '4K UHD';
      videoQuality = '4K';
    } else if (
      width >= 1800 ||
      height >= 1000 ||
      videoTitle.includes('1080p') ||
      path.includes('1080p') ||
      videoTitle.includes('fhd')
    ) {
      resolution = '1080p HD';
      videoQuality = '1080p';
    } else if (
      width >= 1200 ||
      height >= 700 ||
      videoTitle.includes('720p') ||
      path.includes('720p') ||
      videoTitle.includes('hd')
    ) {
      resolution = '720p HD';
      videoQuality = '720p';
    } else if (
      (height > 0 && height < 700) ||
      (width > 0 && width < 1200) ||
      videoTitle.includes('sd') ||
      path.includes('480p') ||
      path.includes('576p')
    ) {
      resolution = 'SD';
      videoQuality = 'SD';
    } else if (item.Type === 'Series') {
      resolution = 'HD';
      videoQuality = 'HD';
    }

    // HDR detection
    const range = (videoStream?.VideoRange || videoStream?.VideoRangeType || '').toUpperCase();
    const hasHdr =
      range.includes('HDR') ||
      range.includes('DOVI') ||
      videoTitle.includes('hdr') ||
      videoTitle.includes('dovi') ||
      path.includes('hdr') ||
      path.includes('dolby vision');

    // Audio Quality detection
    let audioQuality: string | undefined;
    const audioTitle = (audioStream?.DisplayTitle || '').toLowerCase();
    const channels = audioStream?.Channels || 0;
    const layout = (audioStream?.ChannelLayout || '').toLowerCase();
    const spatial = (audioStream?.AudioSpatialFormat || '').toLowerCase();

    if (spatial.includes('atmos') || audioTitle.includes('atmos') || path.includes('atmos')) {
      audioQuality = 'Dolby Atmos';
    } else if (channels >= 8 || layout.includes('7.1') || audioTitle.includes('7.1') || path.includes('7.1')) {
      audioQuality = '7.1 Surround';
    } else if (channels >= 5 || layout.includes('5.1') || audioTitle.includes('5.1') || path.includes('5.1')) {
      audioQuality = '5.1 Surround';
    } else if (
      channels === 2 ||
      layout.includes('stereo') ||
      audioTitle.includes('stereo') ||
      path.includes('2.0') ||
      path.includes('stereo')
    ) {
      audioQuality = 'Stereo';
    } else if (channels === 1 || layout.includes('mono') || audioTitle.includes('mono')) {
      audioQuality = 'Mono';
    } else if (audioStream) {
      audioQuality = 'Stereo';
    }

    return { resolution, videoQuality, audioQuality, hasHdr };
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

    const quality = this.parseMediaQuality(item);

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
      seasonsCount: isSeries && typeof item.ChildCount === 'number' && item.ChildCount > 0 ? item.ChildCount : undefined,
      source: 'jellyfin',
      jellyfinId: item.Id,
      status: 'available',
      played: Boolean(item.UserData?.Played),
      playbackPositionTicks: playbackTicks,
      totalDurationTicks: totalTicks,
      progressPercent,
      resolution: quality.resolution,
      videoQuality: quality.videoQuality,
      audioQuality: quality.audioQuality,
      hasHdr: quality.hasHdr,
      cast: item.People?.map((p) => ({
        name: p.Name,
        role: p.Role || p.Type,
      })),
      videoStreamUrl:
        isMovie || isEpisode
          ? `/api/preview-stream?itemId=${item.Id}${playbackTicks > 0 ? `&ticks=${playbackTicks}` : ''}`
          : undefined,
    };
  }

  async getUserTopGenres(userId?: string): Promise<string[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = userId || (await this.getFirstUserId());
      if (!uid) return [];

      const genreWeights: Record<string, number> = {};

      // 1. Fetch Resume items (weight: 3)
      const resumeRes = await fetch(
        `${this.url}/UserItems/Resume?userId=${uid}&Limit=20&Fields=Genres`,
        { headers: this.getHeaders(), next: { revalidate: 30 } }
      );
      if (resumeRes.ok) {
        const resumeData = await resumeRes.json();
        for (const item of resumeData.Items || []) {
          for (const g of item.Genres || []) {
            genreWeights[g] = (genreWeights[g] || 0) + 3;
          }
        }
      }

      // 2. Fetch Played / Watched items (weight: 1)
      const playedRes = await fetch(
        `${this.url}/Users/${uid}/Items?SortBy=DatePlayed&SortOrder=Descending&Filters=IsPlayed&Limit=30&Recursive=true&Fields=Genres`,
        { headers: this.getHeaders(), next: { revalidate: 60 } }
      );
      if (playedRes.ok) {
        const playedData = await playedRes.json();
        for (const item of playedData.Items || []) {
          for (const g of item.Genres || []) {
            genreWeights[g] = (genreWeights[g] || 0) + 1;
          }
        }
      }

      // Sort by accumulated weight descending
      return Object.entries(genreWeights)
        .sort((a, b) => b[1] - a[1])
        .map(([genre]) => genre);
    } catch (e) {
      console.error('Failed fetching user top genres from Jellyfin:', e);
      return [];
    }
  }

  async getResumeItems(): Promise<MediaItem[]> {
    if (!this.isConfigured()) return [];
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/UserItems/Resume?userId=${uid}&Limit=12&Fields=Overview,Genres,OfficialRating,CommunityRating,People,RunTimeTicks,LocationType,MediaStreams,Width,Height,MediaSources`,
        { headers: this.getHeaders(), next: { revalidate: 30 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const validItems = (data.Items || []).filter((item: JellyfinItem) => item.LocationType !== 'Virtual');
      const mapped = validItems.map((item: JellyfinItem) => this.mapJellyfinItem(item));
      return await this.attachPlayableStreamsToItems(mapped);
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
        `${this.url}/Users/${uid}/Items?IncludeItemTypes=${type}&SortBy=DateCreated&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks,LocationType,MediaStreams,Width,Height,MediaSources`,
        { headers: this.getHeaders(), next: { revalidate: 60 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const validItems = (data.Items || []).filter((item: JellyfinItem) => item.LocationType !== 'Virtual');
      const mapped = validItems.map((item: JellyfinItem) => this.mapJellyfinItem(item));
      if (type === 'Series') {
        return await this.attachPlayableStreamsToItems(mapped);
      }
      return mapped;
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
        `${this.url}/Users/${uid}/Items?IncludeItemTypes=Movie,Series&SortBy=CommunityRating&SortOrder=Descending&Limit=${limit}&Recursive=true&Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks,LocationType,MediaStreams,Width,Height,MediaSources`,
        { headers: this.getHeaders(), next: { revalidate: 120 } }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const validItems = (data.Items || []).filter((item: JellyfinItem) => item.LocationType !== 'Virtual');
      const mapped = validItems.map((item: JellyfinItem) => this.mapJellyfinItem(item));
      return await this.attachPlayableStreamsToItems(mapped);
    } catch (e) {
      console.error('Error fetching top rated from Jellyfin:', e);
      return [];
    }
  }

  async getSeriesFirstPlayableEpisodeId(seriesId: string): Promise<string | undefined> {
    if (!this.isConfigured() || !seriesId) return undefined;
    try {
      const uid = await this.getFirstUserId();
      // First check NextUp for this specific series
      const nextUpRes = await fetch(
        `${this.url}/Shows/NextUp?SeriesId=${seriesId}&UserId=${uid}&Limit=1`,
        { headers: this.getHeaders(), next: { revalidate: 60 } }
      );
      if (nextUpRes.ok) {
        const nextUpData = await nextUpRes.json();
        const candidate = (nextUpData.Items || []).find((ep: JellyfinItem) => ep.LocationType !== 'Virtual');
        if (candidate) return candidate.Id;
      }

      // Fallback: fetch episodes of the series, skipping Virtual or Specials
      const epRes = await fetch(
        `${this.url}/Shows/${seriesId}/Episodes?userId=${uid}&Limit=20&Fields=LocationType,ParentIndexNumber,IndexNumber`,
        { headers: this.getHeaders(), next: { revalidate: 120 } }
      );
      if (epRes.ok) {
        const epData = await epRes.json();
        const realEps = (epData.Items || []).filter((ep: JellyfinItem) => ep.LocationType !== 'Virtual');
        // Prefer season 1+ first
        const regularEp = realEps.find((ep: JellyfinItem) => (ep.ParentIndexNumber || 0) > 0);
        if (regularEp) return regularEp.Id;
        if (realEps.length > 0) return realEps[0].Id;
      }
    } catch (e) {
      console.error(`Error resolving first episode for series ${seriesId}:`, e);
    }
    return undefined;
  }

  async attachPlayableStreamsToItems(items: MediaItem[]): Promise<MediaItem[]> {
    if (!this.isConfigured() || items.length === 0) return items;
    const seriesItems = items.filter((item) => item.type === 'Series' && !item.videoStreamUrl);
    if (seriesItems.length === 0) return items;

    try {
      const uid = await this.getFirstUserId();
      const nextUpRes = await fetch(
        `${this.url}/Shows/NextUp?UserId=${uid}&Limit=100`,
        { headers: this.getHeaders(), next: { revalidate: 60 } }
      );
      const nextUpMap = new Map<string, { epId: string; positionTicks?: number; totalTicks?: number }>();
      if (nextUpRes.ok) {
        const nextUpData = await nextUpRes.json();
        for (const ep of nextUpData.Items || []) {
          if (ep.SeriesId && ep.Id && ep.LocationType !== 'Virtual') {
            nextUpMap.set(ep.SeriesId, {
              epId: ep.Id,
              positionTicks: ep.UserData?.PlaybackPositionTicks,
              totalTicks: ep.RunTimeTicks,
            });
          }
        }
      }

      await Promise.all(
        seriesItems.map(async (series) => {
          const nextUp = nextUpMap.get(series.id);
          const epId = nextUp?.epId || await this.getSeriesFirstPlayableEpisodeId(series.id);
          if (epId) {
            const ticks = nextUp?.positionTicks && nextUp.positionTicks > 0 ? nextUp.positionTicks : 0;
            series.videoStreamUrl = `/api/preview-stream?itemId=${epId}${ticks > 0 ? `&ticks=${ticks}` : ''}`;
            series.playableEpisodeId = epId;
            if (ticks > 0) {
              series.playbackPositionTicks = ticks;
              if (nextUp?.totalTicks && nextUp.totalTicks > 0) {
                series.progressPercent = Math.round((ticks / nextUp.totalTicks) * 100);
              }
            }
          }
        })
      );
    } catch (e) {
      console.error('Error attaching series stream URLs:', e);
    }

    return items;
  }

  async getItemDetails(itemId: string): Promise<MediaItem | null> {
    if (!this.isConfigured()) return null;
    try {
      const uid = await this.getFirstUserId();
      const res = await fetch(
        `${this.url}/Users/${uid}/Items/${itemId}?Fields=Overview,Genres,OfficialRating,CommunityRating,People,BackdropImageTags,ChildCount,RunTimeTicks,LocationType,SeriesId,SeriesName,MediaStreams,Width,Height,MediaSources`,
        { headers: this.getHeaders(), cache: 'no-store' }
      );
      if (!res.ok) return null;
      const data: JellyfinItem = await res.json();
      const media = this.mapJellyfinItem(data);

      if (data.Type === 'Series') {
        media.seasons = await this.getSeriesSeasons(itemId);
        // Find first playable episode
        const firstEp = media.seasons.flatMap((s) => s.episodes || []).find((ep) => ep.videoStreamUrl);
        if (firstEp) {
          media.playableEpisodeId = firstEp.jellyfinId || firstEp.id;
          media.videoStreamUrl = firstEp.videoStreamUrl;
        } else {
          const epId = await this.getSeriesFirstPlayableEpisodeId(itemId);
          if (epId) {
            media.playableEpisodeId = epId;
            media.videoStreamUrl = this.getStreamUrl(epId);
          }
        }
      } else if (data.Type === 'Episode' && data.SeriesId) {
        media.seasons = await this.getSeriesSeasons(data.SeriesId);
        media.playableEpisodeId = data.Id;
        media.videoStreamUrl = this.getStreamUrl(data.Id);
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
        { headers: this.getHeaders(), cache: 'no-store' }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const seasons: Season[] = [];

      if (!data.Items || data.Items.length === 0) {
        // Fallback: Fetch all episodes directly for the series and group by ParentIndexNumber
        const allEpRes = await fetch(
          `${this.url}/Shows/${seriesId}/Episodes?userId=${uid}&Fields=Overview,RunTimeTicks,IndexNumber,ParentIndexNumber,LocationType,UserData`,
          { headers: this.getHeaders(), cache: 'no-store' }
        );
        if (allEpRes.ok) {
          const allEpData = await allEpRes.json();
          const epItems = (allEpData.Items || []).filter((ep: JellyfinItem) => ep.LocationType !== 'Virtual');
          const seasonMap = new Map<number, Episode[]>();
          for (const ep of epItems) {
            const sNum = ep.ParentIndexNumber || 1;
            if (!seasonMap.has(sNum)) seasonMap.set(sNum, []);
            const epPlaybackTicks = ep.UserData?.PlaybackPositionTicks || 0;
            const epTotalTicks = ep.RunTimeTicks || 0;
            const epProgress = epTotalTicks > 0 ? Math.round((epPlaybackTicks / epTotalTicks) * 100) : 0;
            const epPlayed = Boolean(ep.UserData?.Played);
            seasonMap.get(sNum)!.push({
              id: ep.Id,
              episodeNumber: ep.IndexNumber || 1,
              seasonNumber: sNum,
              name: ep.Name,
              overview: ep.Overview || 'No description available.',
              durationMinutes: ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / (10000 * 1000 * 60)) : 45,
              totalDurationTicks: ep.RunTimeTicks,
              playbackPositionTicks: epPlaybackTicks,
              progressPercent: epProgress,
              played: epPlayed,
              thumbnailUrl: this.getImageUrl(ep.Id, 'Primary', 400),
              jellyfinId: ep.Id,
              videoStreamUrl: this.getStreamUrl(ep.Id),
            });
          }

          const sortedEntries = Array.from(seasonMap.entries()).sort(([a], [b]) => a - b);
          return sortedEntries.map(([sNum, eps]) => ({
            id: `season-${sNum}`,
            seasonNumber: sNum,
            name: `Season ${sNum}`,
            episodeCount: eps.length,
            episodes: eps.sort((a, b) => a.episodeNumber - b.episodeNumber),
          }));
        }
        return [];
      }

      for (const s of data.Items || []) {
        // Fetch episodes for season
        const epRes = await fetch(
          `${this.url}/Shows/${seriesId}/Episodes?seasonId=${s.Id}&userId=${uid}&Fields=Overview,RunTimeTicks,IndexNumber,LocationType,UserData`,
          { headers: this.getHeaders(), cache: 'no-store' }
        );
        let episodes: Episode[] = [];
        if (epRes.ok) {
          const epData = await epRes.json();
          episodes = (epData.Items || [])
            .filter((ep: JellyfinItem) => ep.LocationType !== 'Virtual')
            .map((ep: JellyfinItem) => {
              const epPlaybackTicks = ep.UserData?.PlaybackPositionTicks || 0;
              const epTotalTicks = ep.RunTimeTicks || 0;
              const epProgress = epTotalTicks > 0 ? Math.round((epPlaybackTicks / epTotalTicks) * 100) : 0;
              const epPlayed = Boolean(ep.UserData?.Played);
              return {
                id: ep.Id,
                episodeNumber: ep.IndexNumber || 1,
                seasonNumber: s.IndexNumber || 1,
                name: ep.Name,
                overview: ep.Overview || 'No description available.',
                durationMinutes: ep.RunTimeTicks ? Math.round(ep.RunTimeTicks / (10000 * 1000 * 60)) : 45,
                totalDurationTicks: ep.RunTimeTicks,
                playbackPositionTicks: epPlaybackTicks,
                progressPercent: epProgress,
                played: epPlayed,
                thumbnailUrl: this.getImageUrl(ep.Id, 'Primary', 400),
                jellyfinId: ep.Id,
                videoStreamUrl: this.getStreamUrl(ep.Id),
              };
            });
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
