'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { MediaItem } from '@/types';
import { MediaCard } from '@/components/MediaCard';
import {
  Film,
  Tv,
  PlaySquare,
  ArrowLeft,
  Search,
  X,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';

interface LibraryCatalogProps {
  libraryType: 'movies' | 'tv' | 'youtube';
  onPlay: (item: MediaItem) => void;
  onOpenModal: (item: MediaItem) => void;
  onBackToHome: () => void;
  onRequest?: (item: MediaItem) => void;
}

const ALPHABET = ['All', '#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

export const LibraryCatalog: React.FC<LibraryCatalogProps> = ({
  libraryType,
  onPlay,
  onOpenModal,
  onBackToHome,
  onRequest,
}) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [availableLetters, setAvailableLetters] = useState<string[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all library items from the backend
  useEffect(() => {
    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/library/${libraryType}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (isCancelled) return;
        setItems(data.items || []);
        setTotalCount(data.totalCount || 0);
        setAvailableLetters(data.availableLetters || []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('Failed to load library:', err);
        setError('Failed to load media catalog from Jellyfin.');
        setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [libraryType]);

  // Client-side filtering by letter and search query
  const displayedItems = useMemo(() => {
    let result = items;

    if (selectedLetter !== 'All') {
      result = result.filter((item) => {
        const clean = (item.title || '').trim();
        if (!clean) return false;
        const first = clean[0].toUpperCase();
        if (selectedLetter === '#') {
          return !/[A-Z]/.test(first);
        }
        return first === selectedLetter;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.overview?.toLowerCase().includes(q) ||
          item.genres.some((g) => g.toLowerCase().includes(q))
      );
    }

    return result;
  }, [items, selectedLetter, searchQuery]);

  const libraryMeta = {
    movies: {
      name: 'Movies',
      icon: Film,
      singular: 'Movie',
      badgeColor: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
      description: 'Complete collection of movies stored on your Jellyfin server, listed A–Z.',
    },
    tv: {
      name: 'TV Shows',
      icon: Tv,
      singular: 'Series',
      badgeColor: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
      description: 'All TV series available on your Jellyfin server, listed A–Z.',
    },
    youtube: {
      name: 'YouTube',
      icon: PlaySquare,
      singular: 'Video',
      badgeColor: 'bg-red-600/20 text-red-400 border-red-500/30',
      description: 'Downloaded YouTube library on Jellyfin, listed A–Z.',
    },
  }[libraryType];

  const Icon = libraryMeta.icon;

  return (
    <div className="min-h-screen bg-[#141414] text-white pt-20 pb-24 px-4 sm:px-8 md:px-12 max-w-7xl mx-auto animate-fade-in">
      {/* Top Breadcrumb & Back Action */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onBackToHome}
          className="inline-flex items-center space-x-2 text-sm text-neutral-400 hover:text-white transition-colors group px-3 py-1.5 rounded-lg hover:bg-neutral-800"
        >
          <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
          <span>Back to Home Streaming</span>
        </button>

        <div className="text-xs text-neutral-400 flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>Jellyfin Server A–Z Catalog</span>
        </div>
      </div>

      {/* Library Title Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-neutral-800">
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-red-600/10 border border-red-500/30 text-red-500 flex items-center justify-center shadow-lg">
              <Icon size={22} />
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight">
              {libraryMeta.name}
            </h1>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${libraryMeta.badgeColor}`}
            >
              {totalCount} {totalCount === 1 ? libraryMeta.singular : `${libraryMeta.singular}s`}
            </span>
          </div>
          <p className="text-sm text-neutral-400 max-w-2xl">{libraryMeta.description}</p>
        </div>

        {/* In-Catalog Search Bar */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Filter ${libraryMeta.name.toLowerCase()}...`}
            className="w-full pl-9 pr-8 py-2 bg-neutral-900 border border-neutral-700/80 rounded-lg text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Sticky Alphabetical Jump Filter Bar */}
      <div className="sticky top-16 z-30 bg-[#141414]/95 backdrop-blur-md py-3 border-b border-neutral-800/80 my-4 -mx-4 px-4 sm:-mx-8 sm:px-8 md:-mx-12 md:px-12">
        <div className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-1">
          {ALPHABET.map((char) => {
            const isSelected = selectedLetter === char;
            const hasItems = char === 'All' || availableLetters.includes(char);

            return (
              <button
                key={char}
                onClick={() => setSelectedLetter(char)}
                disabled={!hasItems}
                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center justify-center ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-md shadow-red-950/40 scale-105'
                    : hasItems
                    ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                    : 'text-neutral-600 cursor-not-allowed opacity-40'
                }`}
                title={hasItems ? `Filter by ${char}` : `No titles start with ${char}`}
              >
                {char}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="py-20 flex flex-col items-center justify-center space-y-4">
          <RefreshCw size={32} className="animate-spin text-red-600" />
          <p className="text-sm text-neutral-400">Loading {libraryMeta.name} from Jellyfin...</p>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="py-16 text-center space-y-4 bg-neutral-900/60 rounded-2xl border border-red-500/20 p-8 max-w-lg mx-auto">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Media Catalog Grid */}
      {!isLoading && !error && displayedItems.length > 0 && (
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-4 px-1">
            <span>
              Showing {displayedItems.length} of {totalCount}{' '}
              {displayedItems.length === 1 ? libraryMeta.singular : `${libraryMeta.singular}s`}
              {selectedLetter !== 'All' ? ` (starting with "${selectedLetter}")` : ''}
              {searchQuery ? ` matching "${searchQuery}"` : ''}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
            {displayedItems.map((item) => (
              <div key={item.id} className="relative group">
                <MediaCard
                  item={item}
                  onPlay={onPlay}
                  onOpenModal={onOpenModal}
                  onRequest={onRequest}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State when Letter or Search has 0 results */}
      {!isLoading && !error && displayedItems.length === 0 && (
        <div className="py-20 text-center space-y-4 max-w-md mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
            <SlidersHorizontal size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">No titles found</h3>
            <p className="text-sm text-neutral-400 mt-1">
              {searchQuery
                ? `No ${libraryMeta.name.toLowerCase()} matched "${searchQuery}".`
                : `There are no ${libraryMeta.name.toLowerCase()} starting with "${selectedLetter}".`}
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedLetter('All');
              setSearchQuery('');
            }}
            className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Show All {libraryMeta.name}
          </button>
        </div>
      )}
    </div>
  );
};
