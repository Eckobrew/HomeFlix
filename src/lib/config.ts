import fs from 'fs';
import path from 'path';
import { ServerConfig } from '@/types';

function getConfigFilePath(): string {
  const custom = process.env.DATA_DIR;
  let targetDir = custom || path.join(process.cwd(), 'data');

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.accessSync(targetDir, fs.constants.W_OK);
    return path.join(targetDir, 'config.json');
  } catch {
    const fallbackDir = path.join('/tmp', 'homeflix-data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'config.json');
  }
}

export const sanitizeUrl = (url: string): string => {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
};

// Configuration merged from persistent config.json and environment variables
export const getServerConfig = (): ServerConfig => {
  let fileConfig: Partial<ServerConfig> = {};
  const filePath = getConfigFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileConfig = JSON.parse(content) || {};
    }
  } catch (err) {
    console.error('Failed reading config.json:', err);
  }

  const jellyfinUrl =
    fileConfig.jellyfinUrl ||
    process.env.JELLYFIN_URL ||
    process.env.NEXT_PUBLIC_JELLYFIN_URL ||
    '';
  const jellyfinApiKey =
    fileConfig.jellyfinApiKey ||
    process.env.JELLYFIN_API_KEY ||
    '';
  const jellyfinUserId =
    fileConfig.jellyfinUserId ||
    process.env.JELLYFIN_USER_ID ||
    '';
  const seerrUrl =
    fileConfig.seerrUrl ||
    process.env.SEERR_URL ||
    process.env.NEXT_PUBLIC_SEERR_URL ||
    '';
  const seerrApiKey =
    fileConfig.seerrApiKey ||
    process.env.SEERR_API_KEY ||
    '';

  const qbittorrentUrl =
    fileConfig.qbittorrentUrl ||
    process.env.QBITTORRENT_URL ||
    process.env.NEXT_PUBLIC_QBITTORRENT_URL ||
    '';
  const qbittorrentUsername =
    fileConfig.qbittorrentUsername ||
    process.env.QBITTORRENT_USERNAME ||
    '';
  const qbittorrentPassword =
    fileConfig.qbittorrentPassword ||
    process.env.QBITTORRENT_PASSWORD ||
    '';
  const downloadsPath =
    fileConfig.downloadsPath ||
    process.env.DOWNLOADS_PATH ||
    '/downloads';

  const appName =
    fileConfig.appName ||
    process.env.APP_NAME ||
    process.env.NEXT_PUBLIC_APP_NAME ||
    'HomeStream';

  const isConfigured = Boolean(
    (jellyfinUrl && jellyfinApiKey) || (seerrUrl && seerrApiKey)
  );

  return {
    appName,
    jellyfinUrl: sanitizeUrl(jellyfinUrl),
    jellyfinApiKey,
    jellyfinUserId,
    seerrUrl: sanitizeUrl(seerrUrl),
    seerrApiKey,
    qbittorrentUrl: sanitizeUrl(qbittorrentUrl),
    qbittorrentUsername,
    qbittorrentPassword,
    downloadsPath,
    isConfigured,
  };
};

export const saveServerConfig = (newConfig: Partial<ServerConfig>): ServerConfig => {
  const current = getServerConfig();
  const merged: ServerConfig = {
    ...current,
    ...newConfig,
    appName: newConfig.appName || current.appName || 'HomeStream',
    jellyfinUrl: sanitizeUrl(newConfig.jellyfinUrl !== undefined ? newConfig.jellyfinUrl : current.jellyfinUrl),
    seerrUrl: sanitizeUrl(newConfig.seerrUrl !== undefined ? newConfig.seerrUrl : current.seerrUrl),
    jellyfinApiKey: newConfig.jellyfinApiKey !== undefined ? newConfig.jellyfinApiKey : current.jellyfinApiKey,
    seerrApiKey: newConfig.seerrApiKey !== undefined ? newConfig.seerrApiKey : current.seerrApiKey,
    jellyfinUserId: newConfig.jellyfinUserId !== undefined ? newConfig.jellyfinUserId : current.jellyfinUserId,
    qbittorrentUrl: sanitizeUrl(newConfig.qbittorrentUrl !== undefined ? newConfig.qbittorrentUrl : current.qbittorrentUrl || ''),
    qbittorrentUsername: newConfig.qbittorrentUsername !== undefined ? newConfig.qbittorrentUsername : current.qbittorrentUsername,
    qbittorrentPassword: newConfig.qbittorrentPassword !== undefined ? newConfig.qbittorrentPassword : current.qbittorrentPassword,
    downloadsPath: newConfig.downloadsPath !== undefined ? newConfig.downloadsPath : current.downloadsPath,
    isConfigured: false,
  };

  merged.isConfigured = Boolean(
    (merged.jellyfinUrl && merged.jellyfinApiKey) || (merged.seerrUrl && merged.seerrApiKey)
  );

  const filePath = getConfigFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed writing config.json:', err);
  }

  return merged;
};
