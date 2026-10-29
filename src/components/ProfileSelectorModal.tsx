'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useProfile } from '@/context/ProfileContext';
import { PROFILE_PALETTES, getInitials } from '@/lib/profile-constants';
import {
  X,
  Check,
  ShieldCheck,
  Plus,
  Trash2,
  Loader2,
  Settings,
  ArrowLeft,
  Download,
  Users,
} from 'lucide-react';

export const ProfileSelectorModal: React.FC = () => {
  const {
    profiles,
    activeProfile,
    isSelectorOpen,
    needsSetup,
    canSwitchProfile,
    isExternal,
    availableJellyfinUsers,
    closeSelector,
    selectProfile,
    createProfile,
    deleteProfile,
    importProfiles,
    fetchAvailableJellyfinUsers,
  } = useProfile();

  const [isManageMode, setIsManageMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isImportMode, setIsImportMode] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<string[]>([]);
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Automatically open import mode on first run if setup is needed
  useEffect(() => {
    if (needsSetup) {
      setIsImportMode(true);
      fetchAvailableJellyfinUsers();
    }
  }, [needsSetup, fetchAvailableJellyfinUsers]);

  // Unimported Jellyfin users (available on Jellyfin but not yet added in HomeFlix)
  const unimportedJellyfinUsers = useMemo(() => {
    return availableJellyfinUsers.filter(
      (jUser) =>
        !profiles.some(
          (p) => p.id === jUser.id || (p.jellyfinUserId && p.jellyfinUserId === jUser.id)
        )
    );
  }, [availableJellyfinUsers, profiles]);

  // Pre-select all available users if first run and none selected yet
  useEffect(() => {
    if (needsSetup && availableJellyfinUsers.length > 0 && selectedImportIds.length === 0) {
      // Default to selecting all or the first user
      setSelectedImportIds(availableJellyfinUsers.map((u) => u.id));
    }
  }, [needsSetup, availableJellyfinUsers, selectedImportIds.length]);

  if (!isSelectorOpen || !canSwitchProfile || isExternal) return null;

  const toggleImportSelection = (id: string) => {
    setSelectedImportIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleExecuteImport = async () => {
    if (selectedImportIds.length === 0) return;
    try {
      setIsSubmitting(true);
      setErrorMsg('');
      const success = await importProfiles(selectedImportIds);
      if (success) {
        setIsImportMode(false);
        setIsManageMode(false);
      } else {
        setErrorMsg('Failed to import selected profiles.');
      }
    } catch {
      setErrorMsg('Error importing profiles.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartCreate = () => {
    setNewProfileName('');
    setSelectedPaletteIndex(profiles.length % PROFILE_PALETTES.length);
    setErrorMsg('');
    setIsImportMode(false);
    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setErrorMsg('');
    if (needsSetup) {
      setIsImportMode(true);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newProfileName.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a profile name');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg('');
      const created = await createProfile(trimmed, selectedPaletteIndex);
      if (created) {
        setIsCreating(false);
        setIsImportMode(false);
        setIsManageMode(false);
      } else {
        setErrorMsg('Failed to create profile. Please try again.');
      }
    } catch {
      setErrorMsg('Error creating profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, profileId: string, name: string) => {
    e.stopPropagation();
    if (profiles.length <= 1) return;
    if (confirm(`Are you sure you want to remove the profile "${name}"?`)) {
      await deleteProfile(profileId);
    }
  };

  const activePalette = PROFILE_PALETTES[selectedPaletteIndex] || PROFILE_PALETTES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92 backdrop-blur-md transition-all animate-in fade-in duration-200 p-4 overflow-y-auto">
      {/* Optional dismiss button (disabled on first run when setup is required) */}
      {!needsSetup && activeProfile && !isCreating && !isImportMode && (
        <button
          onClick={() => {
            setIsManageMode(false);
            closeSelector();
          }}
          className="absolute top-5 right-5 sm:top-8 sm:right-8 text-neutral-400 hover:text-white p-2 rounded-full hover:bg-neutral-800 transition-colors z-10"
          title="Close profile selector"
        >
          <X size={26} />
        </button>
      )}

      {/* 1. IMPORT PROFILES VIEW (First run setup or manual import) */}
      {isImportMode ? (
        <div className="w-full max-w-2xl mx-auto bg-neutral-900/90 border border-neutral-800 p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            {!needsSetup ? (
              <button
                onClick={() => setIsImportMode(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 transition-colors"
                title="Back"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div className="w-6" />
            )}
            <h2 className="text-xl sm:text-3xl font-bold text-white">
              {needsSetup ? 'Set Up Your Profiles' : 'Import from Jellyfin'}
            </h2>
            <div className="w-6" />
          </div>

          <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto">
            {needsSetup
              ? 'Welcome to HomeFlix! Select which Jellyfin user profile(s) you would like to import into HomeFlix:'
              : 'Select existing Jellyfin user profile(s) to add to HomeFlix:'}
          </p>

          {/* Jellyfin Users List */}
          {(needsSetup ? availableJellyfinUsers : unimportedJellyfinUsers).length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 sm:gap-4 max-h-[320px] overflow-y-auto p-1">
                {(needsSetup ? availableJellyfinUsers : unimportedJellyfinUsers).map((user) => {
                  const isSelected = selectedImportIds.includes(user.id);

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => toggleImportSelection(user.id)}
                      className={`relative flex flex-col items-center p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                        isSelected
                          ? 'border-red-500 bg-red-950/20 shadow-lg scale-102 ring-1 ring-red-500/50'
                          : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-600'
                      }`}
                    >
                      {/* Checkbox indicator */}
                      <div
                        className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center border transition-colors ${
                          isSelected
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'border-neutral-600 bg-black/40'
                        }`}
                      >
                        {isSelected && <Check size={12} className="stroke-[3]" />}
                      </div>

                      {/* Avatar */}
                      <div
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center font-bold text-lg sm:text-xl text-white shadow bg-gradient-to-br ${
                          user.avatarColor
                        }`}
                      >
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt={user.name}
                            className="w-full h-full object-cover rounded-xl"
                          />
                        ) : (
                          <span>{user.initials}</span>
                        )}
                      </div>

                      {/* Name */}
                      <span className="mt-2 text-xs sm:text-sm font-semibold text-white capitalize truncate max-w-full">
                        {user.name}
                      </span>

                      {user.isAdministrator && (
                        <span className="text-[10px] text-amber-400 font-medium flex items-center space-x-0.5 mt-0.5">
                          <ShieldCheck size={10} />
                          <span>Admin</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selection Summary & Select All Toggle */}
              <div className="flex items-center justify-between text-xs text-neutral-400 px-1 pt-1">
                <span>
                  {selectedImportIds.length} profile
                  {selectedImportIds.length === 1 ? '' : 's'} selected
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const pool = needsSetup ? availableJellyfinUsers : unimportedJellyfinUsers;
                    if (selectedImportIds.length === pool.length) {
                      setSelectedImportIds([]);
                    } else {
                      setSelectedImportIds(pool.map((u) => u.id));
                    }
                  }}
                  className="text-red-400 hover:text-red-300 font-medium"
                >
                  {selectedImportIds.length ===
                  (needsSetup ? availableJellyfinUsers : unimportedJellyfinUsers).length
                    ? 'Deselect All'
                    : 'Select All'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-neutral-950/60 border border-neutral-800 text-center space-y-2">
              <Users size={32} className="mx-auto text-neutral-500" />
              <p className="text-sm font-medium text-neutral-300">
                {needsSetup
                  ? 'No Jellyfin accounts found or server is unreachable.'
                  : 'All available Jellyfin accounts have already been imported.'}
              </p>
              <p className="text-xs text-neutral-500">
                You can create a new custom profile below instead.
              </p>
            </div>
          )}

          {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}

          {/* Action buttons */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleExecuteImport}
              disabled={isSubmitting || selectedImportIds.length === 0}
              className="w-full py-3 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold shadow-lg transition flex items-center justify-center space-x-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Importing Profiles...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>
                    Import {selectedImportIds.length > 0 ? `(${selectedImportIds.length}) ` : ''}
                    Selected Profile{selectedImportIds.length === 1 ? '' : 's'}
                  </span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center space-x-4 text-xs">
              <button
                type="button"
                onClick={handleStartCreate}
                className="text-neutral-400 hover:text-white underline underline-offset-4"
              >
                + Create a new profile manually
              </button>
            </div>
          </div>
        </div>
      ) : isCreating ? (
        /* 2. CREATE PROFILE FORM VIEW */
        <div className="w-full max-w-md mx-auto bg-neutral-900/90 border border-neutral-800 p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6 text-center animate-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between">
            <button
              onClick={handleCancelCreate}
              className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 transition-colors"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Add Profile</h2>
            <div className="w-6" />
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Live Avatar Preview */}
            <div className="flex flex-col items-center space-y-2">
              <div
                className={`w-24 h-24 sm:w-28 sm:h-28 rounded-2xl flex items-center justify-center shadow-xl border-2 border-white/20 transition-all bg-gradient-to-br ${
                  activePalette.avatarColor
                }`}
              >
                <span className="text-3xl sm:text-4xl font-black text-white select-none drop-shadow">
                  {getInitials(newProfileName || 'HF')}
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Avatar preview for &quot;{newProfileName.trim() || 'New Profile'}&quot;
              </p>
            </div>

            {/* Profile Name Input */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Profile Name
              </label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => {
                  setNewProfileName(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="e.g. Guest, Living Room, Alex..."
                maxLength={24}
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 transition"
              />
              {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}
            </div>

            {/* Color Swatch Picker */}
            <div className="space-y-2 text-left">
              <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Choose Color
              </label>
              <div className="flex flex-wrap gap-2.5 justify-center sm:justify-start">
                {PROFILE_PALETTES.map((palette, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPaletteIndex(idx)}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${
                      palette.avatarColor
                    } transition-transform flex items-center justify-center ${
                      selectedPaletteIndex === idx
                        ? 'ring-2 ring-white scale-110 shadow-lg'
                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    {selectedPaletteIndex === idx && <Check size={14} className="text-white stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Form Action Buttons */}
            <div className="flex items-center space-x-3 pt-2">
              <button
                type="button"
                onClick={handleCancelCreate}
                disabled={isSubmitting}
                className="w-1/2 py-2.5 rounded-lg border border-neutral-700 hover:border-neutral-500 text-neutral-300 hover:text-white text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newProfileName.trim()}
                className="w-1/2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold shadow transition flex items-center justify-center space-x-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Profile</span>
                )}
              </button>
            </div>
          </form>
        </div>
      ) : (
        /* 3. MAIN "WHO'S WATCHING?" GRID VIEW */
        <div className="w-full max-w-4xl text-center space-y-8 sm:space-y-12">
          {/* Header Title */}
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white drop-shadow">
              {isManageMode ? 'Manage Profiles' : "Who's watching?"}
            </h1>
            <p className="text-sm sm:text-base text-neutral-400">
              {isManageMode
                ? 'Select a profile to switch, or remove unwanted profiles.'
                : 'Select your profile for your personalized Continue Watching and resume progress.'}
            </p>
          </div>

          {/* Profiles Grid */}
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 max-w-3xl mx-auto px-4">
            {profiles.map((profile) => {
              const isActive = activeProfile?.id === profile.id;

              return (
                <div key={profile.id} className="relative group flex flex-col items-center space-y-3">
                  <button
                    onClick={() => selectProfile(profile.id)}
                    className="flex flex-col items-center space-y-3 cursor-pointer focus:outline-none transition-transform duration-200 hover:scale-105 active:scale-95"
                  >
                    {/* Avatar Box */}
                    <div
                      className={`relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-2xl flex items-center justify-center bg-gradient-to-br ${
                        profile.avatarColor
                      } ${
                        isActive && !isManageMode
                          ? 'border-white ring-4 ring-white/30 scale-105'
                          : 'border-transparent group-hover:border-white/80 group-hover:ring-2 group-hover:ring-white/20'
                      }`}
                    >
                      {profile.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt={profile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl sm:text-4xl md:text-5xl font-black text-white drop-shadow-md select-none tracking-wider">
                          {profile.initials}
                        </span>
                      )}

                      {/* Active Profile Checkmark Badge */}
                      {isActive && !isManageMode && (
                        <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                      )}

                      {/* Administrator Badge */}
                      {profile.isAdministrator && (
                        <div
                          className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-neutral-300 px-1.5 py-0.5 rounded text-[10px] font-semibold flex items-center space-x-0.5 border border-white/10"
                          title="Administrator"
                        >
                          <ShieldCheck size={11} className="text-amber-400" />
                          <span>Admin</span>
                        </div>
                      )}
                    </div>

                    {/* Profile Name */}
                    <span
                      className={`text-sm sm:text-base md:text-lg font-medium transition-colors capitalize ${
                        isActive && !isManageMode
                          ? 'text-white font-bold'
                          : 'text-neutral-400 group-hover:text-white'
                      }`}
                    >
                      {profile.name}
                    </span>
                  </button>

                  {/* Delete Button (in Manage Mode) */}
                  {isManageMode && profiles.length > 1 && (
                    <button
                      onClick={(e) => handleDelete(e, profile.id, profile.name)}
                      className="absolute -top-2 -right-2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-xl transition transform hover:scale-110 active:scale-90 z-20"
                      title={`Remove profile ${profile.name}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* "+ Add Profile" Tile */}
            <button
              onClick={handleStartCreate}
              className="group flex flex-col items-center space-y-3 cursor-pointer focus:outline-none transition-transform duration-200 hover:scale-105 active:scale-95"
            >
              <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-xl border-2 border-dashed border-neutral-700 group-hover:border-white/80 group-hover:bg-neutral-800/40 flex items-center justify-center transition-all duration-300 shadow">
                <Plus size={40} className="text-neutral-500 group-hover:text-white transition-colors" />
              </div>
              <span className="text-sm sm:text-base md:text-lg font-medium text-neutral-400 group-hover:text-white transition-colors">
                Add Profile
              </span>
            </button>
          </div>

          {/* Action Footer Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            {/* Import from Jellyfin button if unimported users exist */}
            {unimportedJellyfinUsers.length > 0 && (
              <button
                onClick={() => {
                  fetchAvailableJellyfinUsers();
                  setSelectedImportIds([]);
                  setIsImportMode(true);
                }}
                className="px-4 py-2 border border-neutral-700 hover:border-neutral-400 text-neutral-300 hover:text-white text-xs sm:text-sm font-semibold transition-colors rounded flex items-center space-x-1.5"
              >
                <Download size={14} />
                <span>Import from Jellyfin ({unimportedJellyfinUsers.length})</span>
              </button>
            )}

            <button
              onClick={() => setIsManageMode(!isManageMode)}
              className="px-4 py-2 border border-neutral-700 hover:border-neutral-400 text-neutral-400 hover:text-white text-xs sm:text-sm font-semibold transition-colors rounded flex items-center space-x-1.5"
            >
              <Settings size={14} />
              <span>{isManageMode ? 'Back to Selection' : 'Manage Profiles'}</span>
            </button>

            {activeProfile && (
              <button
                onClick={() => {
                  setIsManageMode(false);
                  closeSelector();
                }}
                className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs sm:text-sm font-semibold transition-colors rounded shadow"
              >
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
