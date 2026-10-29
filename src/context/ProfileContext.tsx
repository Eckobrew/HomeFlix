'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@/types';

interface ProfileContextType {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  isLoadingProfiles: boolean;
  isSelectorOpen: boolean;
  needsSetup: boolean;
  canSwitchProfile: boolean;
  isExternal: boolean;
  availableJellyfinUsers: UserProfile[];
  openSelector: () => void;
  closeSelector: () => void;
  selectProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string, paletteIndex?: number) => Promise<UserProfile | null>;
  deleteProfile: (profileId: string) => Promise<boolean>;
  importProfiles: (userIds: string[]) => Promise<boolean>;
  refreshProfiles: () => Promise<void>;
  fetchAvailableJellyfinUsers: () => Promise<UserProfile[]>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(true);
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);
  const [needsSetup, setNeedsSetup] = useState<boolean>(false);
  const [canSwitchProfile, setCanSwitchProfile] = useState<boolean>(true);
  const [isExternal, setIsExternal] = useState<boolean>(false);
  const [availableJellyfinUsers, setAvailableJellyfinUsers] = useState<UserProfile[]>([]);

  const fetchProfiles = useCallback(async () => {
    try {
      setIsLoadingProfiles(true);
      const res = await fetch('/api/profiles?includeAvailable=true');
      if (res.ok) {
        const data = await res.json();
        const loadedProfiles: UserProfile[] = data.profiles || [];
        const isExt = Boolean(data.isExternal);
        const canSwitch = data.canSwitchProfile !== false && !isExt;

        setProfiles(loadedProfiles);
        setNeedsSetup(Boolean(data.needsSetup) && !isExt);
        setCanSwitchProfile(canSwitch);
        setIsExternal(isExt);
        setAvailableJellyfinUsers(data.availableJellyfinUsers || []);

        if (data.needsSetup && !isExt) {
          setIsSelectorOpen(true);
        } else if (isExt) {
          setIsSelectorOpen(false);
        }

        const activeId: string = data.activeProfileId;
        const matched = loadedProfiles.find((p) => p.id === activeId) || loadedProfiles[0] || null;
        setActiveProfile(matched);

        if (matched) {
          document.cookie = `homeflix_profile_id=${matched.id}; path=/; max-age=31536000; SameSite=Lax`;
        }
      }
    } catch (err) {
      console.error('Failed to load user profiles:', err);
    } finally {
      setIsLoadingProfiles(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const selectProfile = useCallback(
    async (profileId: string) => {
      const target = profiles.find((p) => p.id === profileId);
      if (!target) return;

      setActiveProfile(target);
      setIsSelectorOpen(false);

      // Persist cookie on client immediately
      document.cookie = `homeflix_profile_id=${target.id}; path=/; max-age=31536000; SameSite=Lax`;

      try {
        await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'select', profileId: target.id }),
        });
      } catch (err) {
        console.error('Failed to persist profile selection to server:', err);
      }

      // Notify window of profile change
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('homeflix-profile-changed', {
            detail: { profile: target },
          })
        );
      }
    },
    [profiles]
  );

  const createProfile = useCallback(
    async (name: string, paletteIndex?: number): Promise<UserProfile | null> => {
      try {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create', name, paletteIndex }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profiles) {
            setProfiles(data.profiles);
            setNeedsSetup(false);
          }
          if (data.profile) {
            setActiveProfile(data.profile);
            setIsSelectorOpen(false);
            document.cookie = `homeflix_profile_id=${data.profile.id}; path=/; max-age=31536000; SameSite=Lax`;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('homeflix-profile-changed', {
                  detail: { profile: data.profile },
                })
              );
            }
            return data.profile;
          }
        }
      } catch (err) {
        console.error('Failed to create profile:', err);
      }
      return null;
    },
    []
  );

  const importProfiles = useCallback(
    async (userIds: string[]): Promise<boolean> => {
      try {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'import', userIds }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profiles) {
            setProfiles(data.profiles);
            setNeedsSetup(false);
          }
          if (data.activeProfileId) {
            const matched = (data.profiles || []).find((p: UserProfile) => p.id === data.activeProfileId);
            if (matched) {
              setActiveProfile(matched);
              document.cookie = `homeflix_profile_id=${matched.id}; path=/; max-age=31536000; SameSite=Lax`;
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('homeflix-profile-changed', {
                    detail: { profile: matched },
                  })
                );
              }
            }
          }
          setIsSelectorOpen(false);
          return true;
        }
      } catch (err) {
        console.error('Failed to import profiles from Jellyfin:', err);
      }
      return false;
    },
    []
  );

  const deleteProfile = useCallback(
    async (profileId: string): Promise<boolean> => {
      try {
        const res = await fetch('/api/profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', profileId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.profiles) {
            setProfiles(data.profiles);
            setNeedsSetup(data.profiles.length === 0);
          }
          if (data.activeProfileId) {
            const nextActive = (data.profiles || []).find((p: UserProfile) => p.id === data.activeProfileId);
            if (nextActive) {
              setActiveProfile(nextActive);
              document.cookie = `homeflix_profile_id=${nextActive.id}; path=/; max-age=31536000; SameSite=Lax`;
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('homeflix-profile-changed', {
                    detail: { profile: nextActive },
                  })
                );
              }
            }
          }
          return true;
        }
      } catch (err) {
        console.error('Failed to delete profile:', err);
      }
      return false;
    },
    []
  );

  const fetchAvailableJellyfinUsers = useCallback(async (): Promise<UserProfile[]> => {
    try {
      const res = await fetch('/api/profiles?includeAvailable=true');
      if (res.ok) {
        const data = await res.json();
        const available = data.availableJellyfinUsers || [];
        setAvailableJellyfinUsers(available);
        return available;
      }
    } catch (err) {
      console.error('Failed to fetch available Jellyfin users:', err);
    }
    return [];
  }, []);

  const openSelector = useCallback(() => {
    if (!canSwitchProfile || isExternal) return;
    setIsSelectorOpen(true);
  }, [canSwitchProfile, isExternal]);

  const closeSelector = useCallback(() => {
    // Only allow closing if setup is already complete (at least 1 profile exists)
    if (!needsSetup && profiles.length > 0) {
      setIsSelectorOpen(false);
    }
  }, [needsSetup, profiles.length]);

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        isLoadingProfiles,
        isSelectorOpen,
        needsSetup,
        canSwitchProfile,
        isExternal,
        availableJellyfinUsers,
        openSelector,
        closeSelector,
        selectProfile,
        createProfile,
        deleteProfile,
        importProfiles,
        refreshProfiles: fetchProfiles,
        fetchAvailableJellyfinUsers,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
