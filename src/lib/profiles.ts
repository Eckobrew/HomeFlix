import fs from 'fs';
import path from 'path';
import { UserProfile } from '@/types';
import { JellyfinClient } from './jellyfin';
import { PROFILE_PALETTES, getInitials } from './profile-constants';

export { PROFILE_PALETTES, getInitials };

const INITIAL_PROFILES: UserProfile[] = [
  {
    id: '76a8becc30804c2fb4914e6a6edeb2e2',
    name: 'Nathan',
    avatarColor: 'from-red-600 to-red-800',
    avatarBg: 'bg-red-600',
    initials: 'N',
    isAdministrator: true,
    jellyfinUserId: '76a8becc30804c2fb4914e6a6edeb2e2',
  },
  {
    id: 'edaf5415cb4a4c69aebe0bbd55d2f219',
    name: 'Mirelle',
    avatarColor: 'from-purple-600 to-pink-600',
    avatarBg: 'bg-purple-600',
    initials: 'M',
    isAdministrator: false,
    jellyfinUserId: 'edaf5415cb4a4c69aebe0bbd55d2f219',
  },
];

function getProfilesFilePath(): string {
  const custom = process.env.DATA_DIR;
  let targetDir = custom || path.join(process.cwd(), 'data');

  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.accessSync(targetDir, fs.constants.W_OK);
    return path.join(targetDir, 'profiles.json');
  } catch {
    const fallbackDir = path.join('/tmp', 'homeflix-data');
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, 'profiles.json');
  }
}

/**
 * Load decoupled HomeFlix profiles from persistent storage.
 * If file does not exist, initializes with Nathan and Mirelle.
 */
export async function getHomeflixProfiles(): Promise<UserProfile[]> {
  const filePath = getProfilesFilePath();

  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed: UserProfile[] = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed reading profiles.json, falling back to initial profiles:', err);
  }

  // File didn't exist or was empty; write defaults
  try {
    fs.writeFileSync(filePath, JSON.stringify(INITIAL_PROFILES, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed writing initial profiles.json:', err);
  }

  return INITIAL_PROFILES;
}

/**
 * Save full list of profiles to disk.
 */
export async function saveHomeflixProfiles(profiles: UserProfile[]): Promise<void> {
  const filePath = getProfilesFilePath();
  fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), 'utf-8');
}

/**
 * Add a new decoupled profile to HomeFlix.
 * If user does not exist in Jellyfin, creates them in Jellyfin via /Users/New.
 */
export async function addHomeflixProfile(
  name: string,
  paletteIndex?: number
): Promise<UserProfile> {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error('Profile name is required');
  }

  const currentProfiles = await getHomeflixProfiles();

  // Check if profile with this name already exists in HomeFlix
  const existingProfile = currentProfiles.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existingProfile) {
    return existingProfile;
  }

  // Check / create in Jellyfin so playback progress & resume items work
  const jellyfin = new JellyfinClient();
  let jellyfinUserId = '';

  if (jellyfin.isConfigured()) {
    try {
      const existingJellyfinUser = await jellyfin.findUserByName(trimmed);
      if (existingJellyfinUser?.id) {
        jellyfinUserId = existingJellyfinUser.id;
      } else {
        // Does not exist in Jellyfin - create it!
        const createdUser = await jellyfin.createUser(trimmed);
        if (createdUser?.id) {
          jellyfinUserId = createdUser.id;
        }
      }
    } catch (e) {
      console.warn('Jellyfin user sync warning during profile creation:', e);
    }
  }

  // Fallback ID if Jellyfin could not provide one
  const profileId = jellyfinUserId || `hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  const chosenPalette =
    typeof paletteIndex === 'number' && PROFILE_PALETTES[paletteIndex]
      ? PROFILE_PALETTES[paletteIndex]
      : PROFILE_PALETTES[currentProfiles.length % PROFILE_PALETTES.length];

  const newProfile: UserProfile = {
    id: profileId,
    name: trimmed,
    avatarColor: chosenPalette.avatarColor,
    avatarBg: chosenPalette.avatarBg,
    initials: getInitials(trimmed),
    isAdministrator: false,
    jellyfinUserId: jellyfinUserId || profileId,
  };

  const updatedList = [...currentProfiles, newProfile];
  await saveHomeflixProfiles(updatedList);

  return newProfile;
}

/**
 * Delete a profile from HomeFlix profiles.
 */
export async function deleteHomeflixProfile(profileId: string): Promise<boolean> {
  const currentProfiles = await getHomeflixProfiles();
  if (currentProfiles.length <= 1) {
    // Prevent deleting the last profile
    return false;
  }

  const filtered = currentProfiles.filter((p) => p.id !== profileId);
  if (filtered.length === currentProfiles.length) {
    return false;
  }

  await saveHomeflixProfiles(filtered);
  return true;
}

/**
 * Resolves a HomeFlix profileId to its linked Jellyfin userId.
 */
export async function resolveJellyfinUserId(profileId?: string): Promise<string> {
  if (!profileId) return '';
  const currentProfiles = await getHomeflixProfiles();
  const matched = currentProfiles.find((p) => p.id === profileId);
  return matched?.jellyfinUserId || profileId;
}
