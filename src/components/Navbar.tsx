'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Home, Tv, Film, Download, Users, ChevronDown, User } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';

interface NavbarProps {
  onSearchChange: (query: string) => void;
  searchQuery: string;
  isDemoMode?: boolean;
  jellyfinConnected: boolean;
  seerrConnected: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSearchChange,
  searchQuery,
  jellyfinConnected,
  seerrConnected,
  activeTab,
  onTabChange,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const { profiles, activeProfile, openSelector, selectProfile } = useProfile();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    if (isProfileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileMenuOpen]);

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 px-3 sm:px-6 md:px-12 py-2.5 sm:py-3 flex items-center justify-between ${
          isScrolled
            ? 'bg-[#141414] shadow-lg shadow-black/80'
            : 'bg-gradient-to-b from-black/90 via-black/40 to-transparent'
        }`}
      >
        {/* Left side: Logo & Navigation */}
        <div className="flex items-center space-x-3 sm:space-x-6 md:space-x-8">
          {/* HomeFlix Logo */}
          <div
            onClick={() => {
              onTabChange('home');
              onSearchChange('');
            }}
            className="cursor-pointer flex items-center select-none group"
          >
            <span className="text-xl sm:text-2xl md:text-3xl font-black tracking-wider text-red-600 transition-transform group-hover:scale-105 duration-200">
              HOMEFLIX
            </span>
          </div>

          {/* Navigation Tabs (Desktop / Tablet) */}
          <div className="hidden md:flex items-center space-x-5 text-sm font-medium">
            <button
              onClick={() => {
                onTabChange('home');
                onSearchChange('');
              }}
              className={`transition-colors ${
                activeTab === 'home' && !searchQuery
                  ? 'text-white font-bold'
                  : 'text-gray-300 hover:text-gray-100'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => onTabChange('series')}
              className={`transition-colors ${
                activeTab === 'series'
                  ? 'text-white font-bold'
                  : 'text-gray-300 hover:text-gray-100'
              }`}
            >
              TV Shows
            </button>
            <button
              onClick={() => onTabChange('movies')}
              className={`transition-colors ${
                activeTab === 'movies'
                  ? 'text-white font-bold'
                  : 'text-gray-300 hover:text-gray-100'
              }`}
            >
              Movies
            </button>
            <button
              onClick={() => onTabChange('requests')}
              className={`transition-colors ${
                activeTab === 'requests'
                  ? 'text-white font-bold'
                  : 'text-gray-300 hover:text-gray-100'
              }`}
            >
              Request Content
            </button>
          </div>
        </div>

        {/* Right side: Search, Server Indicators, Profile */}
        <div className="flex items-center space-x-2.5 sm:space-x-4 md:space-x-5 text-gray-200">
          {/* Search bar */}
          <div
            className={`flex items-center transition-all duration-300 ${
              isSearchOpen || searchQuery
                ? 'bg-black/80 border border-white/40 px-2 sm:px-3 py-1 rounded-sm w-40 sm:w-56 md:w-72'
                : 'w-7 sm:w-8 justify-end'
            }`}
          >
            <Search
              size={18}
              className="cursor-pointer text-gray-300 hover:text-white shrink-0 sm:w-5 sm:h-5"
              onClick={() => setIsSearchOpen(!isSearchOpen)}
            />
            {(isSearchOpen || searchQuery) && (
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                autoFocus
                className="bg-transparent border-none text-white text-xs sm:text-sm outline-none px-1.5 sm:px-2 w-full placeholder-gray-400"
              />
            )}
            {searchQuery && (
              <X
                size={16}
                className="cursor-pointer text-gray-400 hover:text-white shrink-0"
                onClick={() => {
                  onSearchChange('');
                  setIsSearchOpen(false);
                }}
              />
            )}
          </div>

          {/* Server status pill (Desktop / Tablet) */}
          <div
            title="Server Connection Status"
            className="hidden sm:flex items-center space-x-2 bg-neutral-900/80 border border-neutral-700/60 px-2.5 py-1 rounded-full text-xs select-none"
          >
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  jellyfinConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="font-medium text-gray-300">
                {jellyfinConnected ? 'Jellyfin' : 'Demo'}
              </span>
            </div>
            <span className="text-neutral-600">|</span>
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  seerrConnected ? 'bg-emerald-500' : 'bg-neutral-500'
                }`}
              />
              <span className="font-medium text-gray-400">
                {seerrConnected ? 'Seerr' : 'Seerr Off'}
              </span>
            </div>
          </div>

          {/* User Profile Avatar & Dropdown */}
          <div className="relative" ref={profileMenuRef}>
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-1.5 focus:outline-none group cursor-pointer"
              aria-label="Profile menu"
              title={activeProfile ? `Profile: ${activeProfile.name}` : 'Profiles'}
            >
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded overflow-hidden border border-white/20 flex items-center justify-center font-bold text-xs text-white shadow select-none transition-transform group-hover:scale-105 bg-gradient-to-br ${
                  activeProfile?.avatarColor || 'from-red-600 to-red-800'
                }`}
              >
                {activeProfile?.avatarUrl ? (
                  <img
                    src={activeProfile.avatarUrl}
                    alt={activeProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{activeProfile?.initials || 'HF'}</span>
                )}
              </div>
              <ChevronDown
                size={14}
                className={`text-neutral-400 group-hover:text-white transition-transform hidden sm:block ${
                  isProfileMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Profile Dropdown Menu (Netflix-Style) */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md bg-[#191919] border border-neutral-800 shadow-2xl py-2 z-50 text-xs animate-in fade-in slide-in-from-top-2 duration-150">
                {/* Active user header */}
                <div className="px-3 py-2 border-b border-neutral-800/80">
                  <div className="flex items-center space-x-2.5">
                    <div
                      className={`w-8 h-8 rounded shrink-0 flex items-center justify-center font-bold text-xs text-white bg-gradient-to-br ${
                        activeProfile?.avatarColor || 'from-red-600 to-red-800'
                      }`}
                    >
                      {activeProfile?.avatarUrl ? (
                        <img
                          src={activeProfile.avatarUrl}
                          alt={activeProfile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{activeProfile?.initials || 'HF'}</span>
                      )}
                    </div>
                    <div className="truncate">
                      <p className="text-white font-semibold text-sm truncate capitalize">
                        {activeProfile?.name || 'HomeFlix User'}
                      </p>
                      <p className="text-[11px] text-emerald-400 flex items-center space-x-1">
                        <span>Active Profile</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Switch to other profiles */}
                {profiles.filter((p) => p.id !== activeProfile?.id).length > 0 && (
                  <div className="py-1">
                    <div className="px-3 py-1 text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Switch Profile
                    </div>
                    {profiles
                      .filter((p) => p.id !== activeProfile?.id)
                      .map((profile) => (
                        <button
                          key={profile.id}
                          onClick={() => {
                            selectProfile(profile.id);
                            setIsProfileMenuOpen(false);
                          }}
                          className="w-full px-3 py-1.5 flex items-center space-x-2.5 hover:bg-neutral-800/80 text-left transition-colors cursor-pointer group"
                        >
                          <div
                            className={`w-6 h-6 rounded shrink-0 flex items-center justify-center font-bold text-[10px] text-white bg-gradient-to-br ${
                              profile.avatarColor
                            } group-hover:ring-1 group-hover:ring-white`}
                          >
                            {profile.avatarUrl ? (
                              <img
                                src={profile.avatarUrl}
                                alt={profile.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span>{profile.initials}</span>
                            )}
                          </div>
                          <span className="text-neutral-300 group-hover:text-white capitalize text-xs truncate">
                            {profile.name}
                          </span>
                        </button>
                      ))}
                  </div>
                )}

                <div className="border-t border-neutral-800/80 my-1" />

                {/* Open Who's watching modal */}
                <button
                  onClick={() => {
                    openSelector();
                    setIsProfileMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center space-x-2 text-neutral-300 hover:text-white hover:bg-neutral-800/80 transition-colors text-xs cursor-pointer"
                >
                  <Users size={15} className="text-neutral-400" />
                  <span>Who&apos;s watching?</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Bottom Navigation Bar (Pixel 8a / Samsung S26) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/95 border-t border-neutral-800/80 backdrop-blur-lg flex items-center justify-around py-1.5 px-2 pb-safe shadow-[0_-10px_25px_rgba(0,0,0,0.8)]">
        <button
          onClick={() => {
            onTabChange('home');
            onSearchChange('');
          }}
          className={`flex flex-col items-center justify-center space-y-1 py-1 px-2.5 transition-colors ${
            activeTab === 'home' && !searchQuery
              ? 'text-red-500 font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Home size={19} />
          <span className="text-[10px] tracking-tight">Home</span>
        </button>

        <button
          onClick={() => onTabChange('series')}
          className={`flex flex-col items-center justify-center space-y-1 py-1 px-2.5 transition-colors ${
            activeTab === 'series'
              ? 'text-red-500 font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Tv size={19} />
          <span className="text-[10px] tracking-tight">TV Shows</span>
        </button>

        <button
          onClick={() => onTabChange('movies')}
          className={`flex flex-col items-center justify-center space-y-1 py-1 px-2.5 transition-colors ${
            activeTab === 'movies'
              ? 'text-red-500 font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Film size={19} />
          <span className="text-[10px] tracking-tight">Movies</span>
        </button>

        <button
          onClick={() => onTabChange('requests')}
          className={`flex flex-col items-center justify-center space-y-1 py-1 px-2.5 transition-colors ${
            activeTab === 'requests'
              ? 'text-red-500 font-bold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Download size={19} />
          <span className="text-[10px] tracking-tight">Requests</span>
        </button>

        <button
          onClick={openSelector}
          className="flex flex-col items-center justify-center space-y-1 py-1 px-2.5 transition-colors text-neutral-400 hover:text-white"
          title="Switch Profile"
        >
          <div
            className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white bg-gradient-to-br ${
              activeProfile?.avatarColor || 'from-red-600 to-red-800'
            }`}
          >
            {activeProfile?.initials || <User size={13} />}
          </div>
          <span className="text-[10px] tracking-tight capitalize truncate max-w-[48px]">
            {activeProfile?.name || 'Profile'}
          </span>
        </button>
      </div>
    </>
  );
};
