'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '@/types';

interface ProfileContextType {
  profiles: UserProfile[];
  activeProfile: UserProfile | null;
  isLoadingProfiles: boolean;
  isSelectorOpen: boolean;
  openSelector: () => void;
  closeSelector: () => void;
  selectProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string, paletteIndex?: number) => Promise<UserProfile | null>;
  deleteProfile: (profileId: string) => Promise<boolean>;
  refreshProfiles: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(true);
  const [isSelectorOpen, setIsSelectorOpen] = useState<boolean>(false);

  const fetchProfiles = useCallback(async () => {
    try {
      setIsLoadingProfiles(true);
      const res = await fetch('/api/profiles');
      if (res.ok) {
        const data = await res.json();
        const loadedProfiles: UserProfile[] = data.profiles || [];
        setProfiles(loadedProfiles);

        const activeId: string = data.activeProfileId;
        const matched = loadedProfiles.find((p) => p.id === activeId) || loadedProfiles[0] || null;
        setActiveProfile(matched);

        if (matched) {
          // Sync client cookie for immediate synchronous reads
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
          if (data.profiles) setProfiles(data.profiles);
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
          if (data.profiles) setProfiles(data.profiles);
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

  const openSelector = useCallback(() => setIsSelectorOpen(true), []);
  const closeSelector = useCallback(() => setIsSelectorOpen(false), []);

  return (
    <ProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        isLoadingProfiles,
        isSelectorOpen,
        openSelector,
        closeSelector,
        selectProfile,
        createProfile,
        deleteProfile,
        refreshProfiles: fetchProfiles,
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
