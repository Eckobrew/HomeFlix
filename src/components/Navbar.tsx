'use client';

import React, { useState, useEffect } from 'react';
import { Search, Settings, X } from 'lucide-react';

interface NavbarProps {
  onSearchChange: (query: string) => void;
  searchQuery: string;
  onOpenSettings: () => void;
  isDemoMode?: boolean;
  jellyfinConnected: boolean;
  seerrConnected: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSearchChange,
  searchQuery,
  onOpenSettings,
  jellyfinConnected,
  seerrConnected,
  activeTab,
  onTabChange,
}) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-4 md:px-12 py-3 flex items-center justify-between ${
        isScrolled
          ? 'bg-[#141414] shadow-lg shadow-black/80'
          : 'bg-gradient-to-b from-black/90 via-black/40 to-transparent'
      }`}
    >
      {/* Left side: Logo & Navigation */}
      <div className="flex items-center space-x-6 md:space-x-8">
        {/* HomeFlix Logo */}
        <div
          onClick={() => {
            onTabChange('home');
            onSearchChange('');
          }}
          className="cursor-pointer flex items-center select-none group"
        >
          <span className="text-2xl md:text-3xl font-black tracking-wider text-red-600 transition-transform group-hover:scale-105 duration-200">
            HOMEFLIX
          </span>
        </div>

        {/* Navigation Tabs */}
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

      {/* Right side: Search, Server Indicators, Settings, Profile */}
      <div className="flex items-center space-x-4 md:space-x-5 text-gray-200">
        {/* Search bar */}
        <div
          className={`flex items-center transition-all duration-300 ${
            isSearchOpen || searchQuery
              ? 'bg-black/80 border border-white/40 px-3 py-1 rounded-sm w-48 md:w-72'
              : 'w-8 justify-end'
          }`}
        >
          <Search
            size={20}
            className="cursor-pointer text-gray-300 hover:text-white shrink-0"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          />
          {(isSearchOpen || searchQuery) && (
            <input
              type="text"
              placeholder="Titles, people, genres (Seerr)..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              autoFocus
              className="bg-transparent border-none text-white text-sm outline-none px-2 w-full placeholder-gray-400"
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

        {/* Server status pill */}
        <button
          onClick={onOpenSettings}
          title="Server Connection Status"
          className="hidden sm:flex items-center space-x-2 bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-700/60 px-2.5 py-1 rounded-full text-xs transition-colors"
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
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          title="Configure Jellyfin & Seerr"
          className="p-1.5 hover:text-white text-gray-400 transition-colors rounded-full hover:bg-neutral-800"
        >
          <Settings size={20} />
        </button>

        {/* Netflix user avatar */}
        <div
          onClick={onOpenSettings}
          className="w-8 h-8 rounded bg-red-700 cursor-pointer overflow-hidden border border-red-500/50 flex items-center justify-center font-bold text-xs text-white shadow"
        >
          HF
        </div>
      </div>
    </nav>
  );
};
