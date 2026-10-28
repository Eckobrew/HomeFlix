import { ServerConfig } from '@/types';

// Default configuration from environment variables
export const getServerConfig = (): ServerConfig => {
  const jellyfinUrl = process.env.JELLYFIN_URL || process.env.NEXT_PUBLIC_JELLYFIN_URL || '';
  const jellyfinApiKey = process.env.JELLYFIN_API_KEY || '';
  const jellyfinUserId = process.env.JELLYFIN_USER_ID || '';
  const seerrUrl = process.env.SEERR_URL || process.env.NEXT_PUBLIC_SEERR_URL || '';
  const seerrApiKey = process.env.SEERR_API_KEY || '';

  const isConfigured = Boolean(
    (jellyfinUrl && jellyfinApiKey) || (seerrUrl && seerrApiKey)
  );

  return {
    jellyfinUrl: jellyfinUrl.replace(/\/+$/, ''),
    jellyfinApiKey,
    jellyfinUserId,
    seerrUrl: seerrUrl.replace(/\/+$/, ''),
    seerrApiKey,
    isConfigured,
  };
};

export const sanitizeUrl = (url: string): string => {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
};
