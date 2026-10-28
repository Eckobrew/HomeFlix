export type MediaType = 'Movie' | 'Series' | 'Episode';

export type AvailabilityStatus = 'available' | 'partially_available' | 'requested' | 'processing' | 'not_requested';

export interface Episode {
  id: string;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  durationMinutes: number;
  thumbnailUrl: string;
  playbackPositionTicks?: number;
  jellyfinId?: string;
  videoStreamUrl?: string;
}

export interface Season {
  id: string;
  seasonNumber: number;
  name: string;
  episodeCount: number;
  overview?: string;
  episodes?: Episode[];
}

export interface CastMember {
  name: string;
  role: string;
  profileUrl?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  originalTitle?: string;
  overview: string;
  type: MediaType;
  posterUrl: string;
  backdropUrl: string;
  year?: number;
  releaseDate?: string;
  rating?: string; // e.g. "TV-MA", "PG-13"
  matchPercentage?: number; // e.g. 98
  communityRating?: number; // e.g. 8.6
  durationMinutes?: number;
  genres: string[];
  seasonsCount?: number;
  source: 'jellyfin' | 'seerr' | 'demo';
  jellyfinId?: string;
  seerrId?: number;
  tmdbId?: number;
  playableEpisodeId?: string;
  status: AvailabilityStatus;
  playbackPositionTicks?: number;
  totalDurationTicks?: number;
  progressPercent?: number; // 0 - 100 for Continue Watching
  cast?: CastMember[];
  director?: string;
  seasons?: Season[];
  videoStreamUrl?: string;
}

export interface MediaRowSection {
  id: string;
  title: string;
  items: MediaItem[];
  isTop10?: boolean;
}

export interface ServerConfig {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  jellyfinUserId: string;
  seerrUrl: string;
  seerrApiKey: string;
  isConfigured: boolean;
}

export interface RequestMediaPayload {
  mediaType: 'movie' | 'tv';
  mediaId: number; // TMDB ID
  seasons?: number[]; // [1, 2, 3] or all
}
