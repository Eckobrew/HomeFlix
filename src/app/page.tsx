'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { HeroBanner } from '@/components/HeroBanner';
import { MediaRow } from '@/components/MediaRow';
import { MediaModal } from '@/components/MediaModal';
import { BuiltinPlayer } from '@/components/BuiltinPlayer';
import { RequestDialog } from '@/components/RequestDialog';
import { SearchOverlay } from '@/components/SearchOverlay';
import { Sidebar } from '@/components/Sidebar';
import { LibraryCatalog } from '@/components/LibraryCatalog';
import { MediaItem, MediaRowSection, Episode } from '@/types';
import { Loader2, Sparkles } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { InitialSetupModal } from '@/components/InitialSetupModal';
import { AuthModal } from '@/components/AuthModal';

export default function Home() {
  const { activeProfile, refreshProfiles } = useProfile();
  const [hero, setHero] = useState<MediaItem | null>(null);
  const [heroItems, setHeroItems] = useState<MediaItem[]>([]);
  const [sections, setSections] = useState<MediaRowSection[]>([]);
  const [requestSections, setRequestSections] = useState<MediaRowSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [jellyfinConnected, setJellyfinConnected] = useState(false);
  const [seerrConnected, setSeerrConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [isServerSetupOpen, setIsServerSetupOpen] = useState(false);

  // Dedicated Hideable Sidebar & A-Z Library Catalog States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeLibrary, setActiveLibrary] = useState<'movies' | 'tv' | 'youtube' | null>(null);

  // Netflix-style Category Rows for Movies and TV Shows Pages
  const [movieCategories, setMovieCategories] = useState<MediaRowSection[]>([]);
  const [tvCategories, setTvCategories] = useState<MediaRowSection[]>([]);
  const [requestCategories, setRequestCategories] = useState<MediaRowSection[]>([]);

  // Modals & Overlays
  const [modalItem, setModalItem] = useState<MediaItem | null>(null);
  const [playingState, setPlayingState] = useState<{ item: MediaItem; episode?: Episode } | null>(null);
  const [requestItem, setRequestItem] = useState<MediaItem | null>(null);
  const [requestTarget, setRequestTarget] = useState<{
    seasons?: number[];
    episode?: Episode;
  } | undefined>(undefined);

  // Server credentials for player
  const [serverConfig, setServerConfig] = useState<{ appName?: string; jellyfinUrl: string; hasJellyfinKey: boolean }>({
    appName: '',
    jellyfinUrl: '',
    hasJellyfinKey: false,
  });

  // Local/Tailscale vs External Internet Authentication State
  const [authStatus, setAuthStatus] = useState<{
    requiresAuth: boolean;
    isLocalOrTailscale: boolean;
    isAuthenticated: boolean;
  }>({
    requiresAuth: false,
    isLocalOrTailscale: true,
    isAuthenticated: true,
  });

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth');
      if (res.ok) {
        const data = await res.json();
        setAuthStatus({
          requiresAuth: Boolean(data.requiresAuth),
          isLocalOrTailscale: Boolean(data.isLocalOrTailscale),
          isAuthenticated: Boolean(data.isAuthenticated),
        });
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      await checkAuth();
      await refreshProfiles();
      loadHomeData();
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  const fetchCategories = useCallback(async (type: 'movies' | 'series' | 'requests') => {
    try {
      const res = await fetch(`/api/categories/${type}`);
      if (res.ok) {
        const data = await res.json();
        if (type === 'movies') {
          setMovieCategories(data.sections || []);
        } else if (type === 'series') {
          setTvCategories(data.sections || []);
        } else if (type === 'requests') {
          setRequestCategories(data.sections || []);
        }
      }
    } catch (e) {
      console.warn(`Failed to fetch ${type} categories:`, e);
    }
  }, []);

  const loadHomeData = useCallback(async (userId?: string) => {
    try {
      setLoading(true);
      const targetUserId = userId || activeProfile?.id;
      const homeUrl = targetUserId ? `/api/home?userId=${targetUserId}` : '/api/home';
      const [homeRes, configRes] = await Promise.all([
        fetch(homeUrl),
        fetch('/api/config'),
      ]);

      if (homeRes.ok) {
        const homeData = await homeRes.json();
        setHero(homeData.hero || null);
        setHeroItems(homeData.heroItems || (homeData.hero ? [homeData.hero] : []));
        setSections(homeData.sections || []);
        setRequestSections(homeData.requestSections || []);
        setIsDemoMode(Boolean(homeData.isDemoMode));
        setJellyfinConnected(Boolean(homeData.jellyfinConnected));
        setSeerrConnected(Boolean(homeData.seerrConnected));
      }

      if (configRes.ok) {
        const cfg = await configRes.json();
        setServerConfig(cfg);
        if (cfg.isSetupNeeded) {
          setIsServerSetupOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeProfile?.id]);

  useEffect(() => {
    checkAuth();
    loadHomeData(activeProfile?.id);
  }, [checkAuth, loadHomeData, activeProfile?.id]);

  useEffect(() => {
    const handleProfileChanged = (event: any) => {
      const newProfile = event.detail?.profile;
      if (newProfile?.id) {
        loadHomeData(newProfile.id);
      }
    };

    window.addEventListener('homeflix-profile-changed', handleProfileChanged);
    return () => window.removeEventListener('homeflix-profile-changed', handleProfileChanged);
  }, [loadHomeData]);

  // Deep linking and SEO routing on initial URL mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);

    const tabParam = searchParams.get('tab');
    if (tabParam && ['home', 'series', 'movies', 'requests'].includes(tabParam)) {
      setActiveTab(tabParam);
    }

    const mediaParam = searchParams.get('media');
    if (mediaParam) {
      fetch(`/api/media/${mediaParam}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.item) {
            setModalItem(data.item);
          }
        })
        .catch(console.error);
    }

    const watchParam = searchParams.get('watch');
    if (watchParam) {
      fetch(`/api/media/${watchParam}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.item) {
            setPlayingState({ item: data.item });
          }
        })
        .catch(console.error);
    }

    if (searchParams.get('setup') === 'true') {
      setIsServerSetupOpen(true);
    }
  }, []);

  // Prefetch categories and support keyboard shortcut [ for sidebar
  useEffect(() => {
    // Background prefetch
    fetchCategories('movies');
    fetchCategories('series');
    fetchCategories('requests');

    const handleKey = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA'].includes(activeTag)) return;
      if (e.key === '[' || e.key === ']') {
        setIsSidebarOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [fetchCategories]);

  // Handlers with URL synchronization
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setActiveLibrary(null); // Exit A-Z sidebar view and return to standard tab streaming rows
    if (tab === 'movies') fetchCategories('movies');
    if (tab === 'series') fetchCategories('series');
    if (tab === 'requests') fetchCategories('requests');
    if (typeof window !== 'undefined') {
      const url = tab === 'home' ? '/' : `/?tab=${tab}`;
      window.history.pushState(null, '', url);
    }
  };

  const handlePlay = (item: MediaItem, episode?: Episode) => {
    setPlayingState({ item, episode });
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/?watch=${item.id}`);
    }
  };

  const handleClosePlayer = () => {
    setPlayingState(null);
    if (typeof window !== 'undefined') {
      const url = activeTab === 'home' ? '/' : `/?tab=${activeTab}`;
      window.history.replaceState(null, '', url);
    }
  };

  const handleOpenModal = (item: MediaItem) => {
    setModalItem(item);
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', `/?media=${item.id}`);
    }
  };

  const handleCloseModal = () => {
    setModalItem(null);
    if (typeof window !== 'undefined') {
      const url = activeTab === 'home' ? '/' : `/?tab=${activeTab}`;
      window.history.replaceState(null, '', url);
    }
  };

  const handleRequest = (item: MediaItem, seasons?: number[], episode?: Episode) => {
    setRequestItem(item);
    setRequestTarget(seasons || episode ? { seasons, episode } : undefined);
  };

  const handleRequestSuccess = (requestedItem: MediaItem) => {
    const updated: MediaItem = {
      ...requestedItem,
      status: 'processing',
      isDownloading: true,
      downloadProgress: requestedItem.downloadProgress || 0,
    };

    // Update status in existing home sections (without adding my-requests to Home)
    setSections((prev) =>
      prev.map((sec) => ({
        ...sec,
        items: sec.items.map((i) => (i.id === updated.id ? updated : i)),
      }))
    );

    // Update or append to "my-requests" at the bottom of requestSections
    setRequestSections((prev) => {
      const next = prev.map((sec) => ({
        ...sec,
        items: sec.items.map((i) => (i.id === updated.id ? updated : i)),
      }));

      const myReqSec = next.find((s) => s.id === 'my-requests');
      if (myReqSec) {
        if (!myReqSec.items.some((i) => i.id === updated.id)) {
          myReqSec.items = [updated, ...myReqSec.items];
        }
      } else {
        next.push({
          id: 'my-requests',
          title: '⚡ Your Requested Media (Downloading & In-Progress)',
          items: [updated],
        });
      }
      return next;
    });

    // Refresh home data in background to pull live status from Seerr & qBittorrent
    setTimeout(() => {
      loadHomeData();
    }, 2000);
  };

  // Filter sections and items strictly corresponding to active tab
  const displayedSections = useMemo(() => {
    if (activeTab === 'movies') {
      const res: MediaRowSection[] = [];

      // 1. Continue Watching (Movies only)
      const cw = sections.find((s) => s.id === 'continue-watching');
      if (cw) {
        const movieCw = cw.items.filter((i) => i.type === 'Movie');
        if (movieCw.length > 0) {
          res.push({ ...cw, items: movieCw });
        }
      }

      // 2. Netflix Category Rows (Jellyfin available first, then Seerr options)
      if (movieCategories.length > 0) {
        res.push(...movieCategories);
      } else {
        const fallback = sections
          .filter((s) => s.id !== 'continue-watching' && s.id !== 'my-requests')
          .map((sec) => ({
            ...sec,
            title: sec.id === 'trending-seerr' ? 'Trending Movies' : sec.title,
            items: sec.items.filter((i) => i.type === 'Movie'),
          }))
          .filter((sec) => sec.items.length > 0);
        res.push(...fallback);
      }

      return res;
    }

    if (activeTab === 'series') {
      const res: MediaRowSection[] = [];

      // 1. Continue Watching (Series and Episodes only)
      const cw = sections.find((s) => s.id === 'continue-watching');
      if (cw) {
        const seriesCw = cw.items.filter((i) => i.type === 'Series' || i.type === 'Episode');
        if (seriesCw.length > 0) {
          res.push({ ...cw, items: seriesCw });
        }
      }

      // 2. Netflix Category Rows (Jellyfin available first, then Seerr options)
      if (tvCategories.length > 0) {
        res.push(...tvCategories);
      } else {
        const fallback = sections
          .filter((s) => s.id !== 'continue-watching' && s.id !== 'my-requests')
          .map((sec) => ({
            ...sec,
            title: sec.id === 'trending-seerr' ? 'Trending TV Shows' : sec.title,
            items: sec.items.filter((i) => i.type === 'Series' || i.type === 'Episode'),
          }))
          .filter((sec) => sec.items.length > 0);
        res.push(...fallback);
      }

      return res;
    }

    if (activeTab === 'requests') {
      const res: MediaRowSection[] = [];

      // 1. Recommended for You (based on profile's watched content)
      const recommended = requestSections.find((s) => s.id === 'requests-recommended');
      if (recommended && recommended.items.length > 0) {
        res.push(recommended);
      }

      // 2. Popular Titles (including both movies and shows)
      const popular = requestSections.find((s) => s.id === 'requests-popular') ||
        sections.find((s) => s.id === 'trending-seerr');
      if (popular && popular.items.length > 0) {
        res.push({
          ...popular,
          id: 'requests-popular',
          title: 'Popular Titles',
        });
      }

      // 3. Top Movies
      const topMovies = requestSections.find((s) => s.id === 'requests-top-movies');
      if (topMovies && topMovies.items.length > 0) {
        res.push(topMovies);
      }

      // 4. Top TV Shows
      const topTv = requestSections.find((s) => s.id === 'requests-top-tv');
      if (topTv && topTv.items.length > 0) {
        res.push(topTv);
      }

      // 5. Category rows for Request Media tab
      if (requestCategories.length > 0) {
        res.push(...requestCategories);
      }

      // 6. Active / in-progress user downloads and requests placed at the VERY BOTTOM of Request tab
      const myReqSec = requestSections.find((s) => s.id === 'my-requests');
      if (myReqSec && myReqSec.items.length > 0) {
        res.push(myReqSec);
      } else {
        const allRequested = [...sections, ...requestSections]
          .flatMap((s) => s.items)
          .filter((i) => i.status === 'requested' || i.status === 'processing' || i.isDownloading);
        const uniqueRequested = Array.from(new Map(allRequested.map((i) => [i.id, i])).values());

        if (uniqueRequested.length > 0) {
          res.push({
            id: 'my-requests',
            title: '⚡ Your Requested Media (Downloading & In-Progress)',
            items: uniqueRequested,
          });
        }
      }

      return res;
    }

    // Default 'home' tab: all sections, EXCLUDING my-requests (only on Requests tab at the bottom)
    return sections.filter((s) => s.id !== 'my-requests');
  }, [sections, requestSections, activeTab, movieCategories, tvCategories, requestCategories]);

  // Dynamic 5 rotating Hero Items for the active tab (random load + cycle)
  const displayedHeroItems = useMemo(() => {
    if (activeTab === 'requests') {
      const recommendedSec = requestSections.find((s) => s.id === 'requests-recommended');
      if (recommendedSec && recommendedSec.items.length > 0) {
        const candidates = recommendedSec.items.filter((i) => i.backdropUrl && i.overview);
        if (candidates.length > 0) return candidates.slice(0, 5);
        return recommendedSec.items.slice(0, 5);
      }
      const requestCandidates = displayedSections.flatMap((s) => s.items).filter((i) => i.backdropUrl);
      if (requestCandidates.length > 0) return requestCandidates.slice(0, 5);
    }
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
  }, [heroItems, hero, displayedSections, requestSections, activeTab]);

  return (
    <main className="min-h-screen bg-[#141414] text-white selection:bg-red-600 selection:text-white">
      {/* Navigation Header */}
      <Navbar
        appName={serverConfig.appName}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isDemoMode={isDemoMode}
        jellyfinConnected={jellyfinConnected}
        seerrConnected={seerrConnected}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenServerSetup={() => setIsServerSetupOpen(true)}
        isExternal={!authStatus.isLocalOrTailscale}
        onLogout={handleLogout}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
      />

      {/* Hideable Jellyfin Library Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeLibrary={activeLibrary}
        onSelectLibrary={(lib) => {
          setActiveLibrary(lib);
          setIsSidebarOpen(false);
        }}
        appName={serverConfig.appName}
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
      ) : activeLibrary ? (
        /* Dedicated A-Z Jellyfin Library Page (Movies / TV Shows / YouTube) */
        <LibraryCatalog
          libraryType={activeLibrary}
          onPlay={handlePlay}
          onOpenModal={handleOpenModal}
          onBackToHome={() => setActiveLibrary(null)}
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
              onRequest={handleRequest}
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
          <footer className="px-4 md:px-12 py-12 pb-24 md:pb-12 border-t border-neutral-800/60 text-xs text-neutral-500 space-y-4">
            <div className="flex flex-wrap gap-6">
              <span className="hover:text-neutral-400 cursor-pointer">Audio and Subtitles</span>
              <span className="hover:text-neutral-400 cursor-pointer">Help Center</span>
              <span className="hover:text-neutral-400 cursor-pointer">Proxmox LXC Docs</span>
              <span className="hover:text-neutral-400 cursor-pointer">Jellyfin API</span>
              <span className="hover:text-neutral-400 cursor-pointer">Seerr Request Gateway</span>
            </div>
            <p className="text-[11px]">
              &copy; {new Date().getFullYear()} {process.env.NEXT_PUBLIC_APP_NAME || 'HomeStream'}. Built for Jellyfin &amp; Overseerr/Jellyseerr on Proxmox LXC.
            </p>
          </footer>
        </div>
      )}

      {/* Media Detail Modal */}
      {modalItem && (
        <MediaModal
          item={modalItem}
          onClose={handleCloseModal}
          onPlay={handlePlay}
          onRequest={handleRequest}
        />
      )}

      {/* Built-in Web Player Overlay */}
      {playingState && (
        <BuiltinPlayer
          item={playingState.item}
          episode={playingState.episode}
          onClose={handleClosePlayer}
          onNextEpisode={() => {
            if (playingState.item.type === 'Series') {
              const allEps = playingState.item.seasons?.flatMap((s) => s.episodes || []) || [];
              const currentId = playingState.episode?.jellyfinId || playingState.episode?.id;
              const currentIdx = allEps.findIndex(
                (ep) => currentId && (ep.jellyfinId === currentId || ep.id === currentId)
              );
              if (currentIdx !== -1 && currentIdx + 1 < allEps.length) {
                setPlayingState({ item: playingState.item, episode: allEps[currentIdx + 1] });
              }
            }
          }}
          jellyfinServerUrl={serverConfig.jellyfinUrl}
        />
      )}

      {/* Seerr Request Dialog */}
      {requestItem && (
        <RequestDialog
          item={requestItem}
          target={requestTarget}
          onClose={() => {
            setRequestItem(null);
            setRequestTarget(undefined);
          }}
          onSuccess={handleRequestSuccess}
        />
      )}

      {/* Initial Setup & Server Settings Modal */}
      <InitialSetupModal
        isOpen={isServerSetupOpen}
        onClose={() => setIsServerSetupOpen(false)}
        onComplete={() => loadHomeData()}
      />

      {/* External Authentication Modal (Jellyfin Auth Wall) */}
      {authStatus.requiresAuth && !authStatus.isAuthenticated && (
        <AuthModal
          appName={serverConfig.appName}
          onSuccess={() => {
            checkAuth();
            refreshProfiles();
            loadHomeData();
          }}
        />
      )}
    </main>
  );
}
