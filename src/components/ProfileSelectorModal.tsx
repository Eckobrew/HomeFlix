'use client';

import React from 'react';
import { useProfile } from '@/context/ProfileContext';
import { X, Check, ShieldCheck } from 'lucide-react';

export const ProfileSelectorModal: React.FC = () => {
  const { profiles, activeProfile, isSelectorOpen, closeSelector, selectProfile } = useProfile();

  if (!isSelectorOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md transition-all animate-in fade-in duration-200 p-4">
      {/* Optional dismiss button if a profile is already active */}
      {activeProfile && (
        <button
          onClick={closeSelector}
          className="absolute top-5 right-5 sm:top-8 sm:right-8 text-neutral-400 hover:text-white p-2 rounded-full hover:bg-neutral-800 transition-colors"
          title="Close profile selector"
        >
          <X size={26} />
        </button>
      )}

      <div className="w-full max-w-4xl text-center space-y-8 sm:space-y-12">
        {/* Title */}
        <div className="space-y-2">
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white drop-shadow">
            Who&apos;s watching?
          </h1>
          <p className="text-sm sm:text-base text-neutral-400">
            Select your profile for your personalized Continue Watching and watch progress.
          </p>
        </div>

        {/* Profiles Grid */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 max-w-3xl mx-auto px-4">
          {profiles.map((profile) => {
            const isActive = activeProfile?.id === profile.id;

            return (
              <button
                key={profile.id}
                onClick={() => selectProfile(profile.id)}
                className="group flex flex-col items-center space-y-3 cursor-pointer focus:outline-none transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                {/* Avatar Box */}
                <div
                  className={`relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 rounded-xl overflow-hidden border-2 transition-all duration-300 shadow-2xl flex items-center justify-center bg-gradient-to-br ${
                    profile.avatarColor
                  } ${
                    isActive
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
                  {isActive && (
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
                    isActive ? 'text-white font-bold' : 'text-neutral-400 group-hover:text-white'
                  }`}
                >
                  {profile.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={closeSelector}
            className="px-6 py-2 border border-neutral-600 hover:border-white text-neutral-400 hover:text-white uppercase tracking-widest text-xs sm:text-sm font-semibold transition-colors rounded"
          >
            {activeProfile ? 'Done' : 'Select a Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};
