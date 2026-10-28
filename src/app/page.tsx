'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { HeroBanner } from '@/components/HeroBanner';
import { MediaRow } from '@/components/MediaRow';
import { MediaModal } from '@/components/MediaModal';
import { BuiltinPlayer } from '@/components/BuiltinPlayer';
import { RequestDialog } from '@/components/RequestDialog';
import { SearchOverlay } from '@/components/SearchOverlay';
import { MediaItem, MediaRowSection, Episode } from '@/types';
import { Loader2, Sparkles } from 'lucide-react';

export default function Home() {
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const [sections, setSections] = useState<MediaRowSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [jellyfinConnected, setJellyfinConnected] = useState(false);
  const [seerrConnected, setSeerrConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Overlays
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);
  const [playingState, setPlayingState] = useState<{ item: MediaItem; episode?: Episode } | null>(null);
  const [requestItem, setRequestItem] = useState<MediaItem | null>(null);

  // Server credentials for player
  const [serverConfig, setServerConfig] = useState<{ jellyfinUrl: string; hasJellyfinKey: boolean }>({
    jellyfinUrl: '',
    hasJellyfinKey: false,
  });

  const loadHomeData = useCallback(async () => {
    try {
      setLoading(true);
      const [homeRes, configRes] = await Promise.all([
        fetch('/api/home'),
        fetch('/api/config'),
      ]);

      if (homeRes.ok) {
        const homeData = await homeRes.json();
        setHero(homeData.hero || null);
        setHeroItems(homeData.heroItems || (homeData.hero ? [homeData.hero] : []));
        setSections(homeData.sections || []);
        setIsDemoMode(Boolean(homeData.isDemoMode));
        setJellyfinConnected(Boolean(homeData.jellyfinConnected));
        setSeerrConnected(Boolean(homeData.seerrConnected));
      }

      if (configRes.ok) {
        const cfg = await configRes.json();
        setServerConfig(cfg);
      }
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  // Handlers
  const handlePlay = (item: MediaItem, episode?: Episode) => {
    setPlayingState({ item, episode });
  };

  const handleOpenModal = (item: MediaItem) => {
    setModalItem(item);
  };

  const handleRequest = (item: MediaItem) => {
    setRequestItem(item);
  };

  const handleRequestSuccess = (requestedItem: MediaItem) => {
    // Update status in local rows
    setSections((prev) =>
      prev.map((sec) => ({
        ...sec,
        items: sec.items.map((i) =>
          i.id === requestedItem.id ? { ...i, status: 'requested' } : i
        ),
      }))
    );
  };

  // Filter sections and items strictly corresponding to active tab
  const displayedSections = useMemo(() => {
    if (activeTab === 'movies') {
      return sections
        .map((sec) => {
          const movieItems = sec.items.filter((i) => i.type === 'Movie');
          return {
            ...sec,
            title: sec.id === 'trending-seerr' ? 'Trending Movies' : sec.title,
            items: movieItems,
          };
        })
        .filter((sec) => sec.items.length > 0);
    }

    if (activeTab === 'series') {
      return sections
        .map((sec) => {
          const seriesItems = sec.items.filter((i) => i.type === 'Series' || i.type === 'Episode');
          return {
            ...sec,
            title: sec.id === 'trending-seerr' ? 'Trending TV Shows' : sec.title,
            items: seriesItems,
          };
        })
        .filter((sec) => sec.items.length > 0);
    }

    if (activeTab === 'requests') {
      const allRequested = sections
        .flatMap((s) => s.items)
        .filter((i) => i.status === 'requested' || i.status === 'processing');

      const uniqueRequested = Array.from(new Map(allRequested.map((i) => [i.id, i])).values());

      const res: MediaRowSection[] = [];
      if (uniqueRequested.length > 0) {
        res.push({
          id: 'my-requests',
          title: 'Your Requested Media (Downloading)',
          items: uniqueRequested,
        });
      }

      // Add discoverable content to request from Seerr
      const trendingSec = sections.find((s) => s.id === 'trending-seerr');
      if (trendingSec) {
        res.push({
          id: 'trending-requests',
          title: 'Popular Titles to Request on Seerr',
          items: trendingSec.items,
        });
      }

      return res;
    }

    // Default 'home' tab: all sections
    return sections;
  }, [sections, activeTab]);

  // Dynamic 5 rotating Hero Items for the active tab (random load + cycle)
  const displayedHeroItems = useMemo(() => {
    if (activeTab === 'movies') {
      const movieCandidates = heroItems.filter((i) => i.type === 'Movie');
      if (movieCandidates.length > 0) return movieCandidates;
      const sectionMovies = displayedSections.flatMap((s) => s.items).filter((i) => i.type === 'Movie');
      return sectionMovies.slice(0, 5);
    }
    if (activeTab === 'series') {
      const seriesCandidates = heroItems.filter((i) => i.type === 'Series' || i.type === 'Episode');
      if (seriesCandidates.length > 0) return seriesCandidates;
      const sectionSeries = displayedSections.flatMap((s) => s.items).filter((i) => i.type === 'Series');
      return sectionSeries.slice(0, 5);
    }
    return heroItems.length > 0 ? heroItems : (hero ? [hero] : []);
  }, [heroItems, hero, displayedSections, activeTab]);

  return (
    <main className="min-h-screen bg-[#141414] text-white selection:bg-red-600 selection:text-white">
      {/* Navigation Header */}
      <Navbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDemoMode={isDemoMode}
        jellyfinConnected={jellyfinConnected}
        seerrConnected={seerrConnected}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Main Content Area */}
      {searchQuery.trim() ? (
        /* Search View when user types in search bar */
        <SearchOverlay
          query={searchQuery}
          onClose={() => setSearchQuery('')}
          onPlay={handlePlay}
          onOpenModal={handleOpenModal}
          onRequest={handleRequest}
        />
      ) : loading ? (
        /* Loading Skeleton */
        <div className="h-screen w-full flex flex-col items-center justify-center space-y-4">
          <Loader2 size={48} className="animate-spin text-red-600" />
          <p className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            Loading HomeFlix...
          </p>
        </div>
      ) : (
        /* Main Home Content */
        <div>
          {/* Demo Mode Notice Banner (Discreet) */}
          {isDemoMode && (
            <div className="fixed bottom-4 left-4 z-40 bg-neutral-900/90 border border-neutral-700/80 rounded-lg p-3 text-xs text-neutral-300 flex items-center space-x-3 shadow-2xl backdrop-blur-md">
              <Sparkles size={16} className="text-amber-400 shrink-0" />
              <div>
                <span className="font-bold text-white">Running in Demo Mode: </span>
                <span>Configure JELLYFIN_URL and JELLYFIN_API_KEY in your .env file to connect your media library.</span>
              </div>
            </div>
          )}

          {/* Dynamic Rotating Billboard / Hero Banner */}
          {displayedHeroItems.length > 0 && (
            <HeroBanner
              items={displayedHeroItems}
              onPlay={handlePlay}
              onOpenModal={handleOpenModal}
            />
          )}

          {/* Horizontal Scrolling Media Rows */}
          <div className="relative z-20 -mt-16 md:-mt-24 space-y-2 md:space-y-4 pb-20">
            {displayedSections.map((section) => (
              <MediaRow
                key={section.id}
                title={section.title}
                items={section.items}
                isTop10={section.isTop10}
                onPlay={handlePlay}
                onOpenModal={handleOpenModal}
                onRequest={handleRequest}
              />
            ))}
          </div>

          {/* Footer */}
          <footer className="px-4 md:px-12 py-12 border-t border-neutral-800/60 text-xs text-neutral-500 space-y-4">
            <div className="flex flex-wrap gap-6">
              <span className="hover:text-neutral-400 cursor-pointer">Audio and Subtitles</span>
              <span className="hover:text-neutral-400 cursor-pointer">Help Center</span>
              <span className="hover:text-neutral-400 cursor-pointer">Proxmox LXC Docs</span>
              <span className="hover:text-neutral-400 cursor-pointer">Jellyfin API</span>
              <span className="hover:text-neutral-400 cursor-pointer">Seerr Request Gateway</span>
            </div>
            <p className="text-[11px]">
              &copy; {new Date().getFullYear()} HomeFlix. Built for Jellyfin &amp; Overseerr/Jellyseerr on Proxmox LXC.
            </p>
          </footer>
        </div>
      )}

      {/* Media Detail Modal */}
      {modalItem && (
        <MediaModal
          item={modalItem}
          onClose={() => setModalItem(null)}
          onPlay={handlePlay}
          onRequest={handleRequest}
        />
      )}

      {/* Built-in Web Player Overlay */}
      {playingState && (
        <BuiltinPlayer
          item={playingState.item}
          episode={playingState.episode}
          onClose={() => setPlayingState(null)}
          jellyfinServerUrl={serverConfig.jellyfinUrl}
        />
      )}

      {/* Seerr Request Dialog */}
      {requestItem && (
        <RequestDialog
          item={requestItem}
          onClose={() => setRequestItem(null)}
          onSuccess={handleRequestSuccess}
        />
      )}
    </main>
  );
}
