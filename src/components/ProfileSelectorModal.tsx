'use client';

import React, { useState } from 'react';
import { useProfile } from '@/context/ProfileContext';
import { PROFILE_PALETTES, getInitials } from '@/lib/profile-constants';
import { X, Check, ShieldCheck, Plus, Trash2, Loader2, Settings, ArrowLeft } from 'lucide-react';

export const ProfileSelectorModal: React.FC = () => {
  const {
    profiles,
    activeProfile,
    isSelectorOpen,
    closeSelector,
    selectProfile,
    createProfile,
    deleteProfile,
  } = useProfile();

  const [isManageMode, setIsManageMode] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(2); // default nice color
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isSelectorOpen) return null;

  const handleStartCreate = () => {
    setNewProfileName('');
    setSelectedPaletteIndex(profiles.length % PROFILE_PALETTES.length);
    setErrorMsg('');
    setIsCreating(true);
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setErrorMsg('');
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
      {/* Optional dismiss button if a profile is already active */}
      {activeProfile && !isCreating && (
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

      {/* CREATE PROFILE FORM VIEW */}
      {isCreating ? (
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
            <div className="w-6" /> {/* spacer */}
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

            {/* Sync Notice */}
            <p className="text-[11px] text-neutral-400 text-left bg-neutral-950/60 p-2.5 rounded-lg border border-neutral-800">
              💡 This profile will be saved to HomeFlix. If it doesn&apos;t exist in Jellyfin yet, HomeFlix will automatically create it so your watch history is tracked.
            </p>

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
        /* MAIN "WHO'S WATCHING?" GRID VIEW */
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
          <div className="flex items-center justify-center space-x-4 pt-4">
            <button
              onClick={() => setIsManageMode(!isManageMode)}
              className="px-5 py-2 border border-neutral-700 hover:border-neutral-400 text-neutral-400 hover:text-white text-xs sm:text-sm font-semibold transition-colors rounded flex items-center space-x-1.5"
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
