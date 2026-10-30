'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Plus,
  Check,
  Download,
  ThumbsUp,
  Clock,
  Film,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { MediaItem, Season, Episode } from '@/types';

interface MediaModalProps {
  item: MediaItem | null;
  onClose: () => void;
  onPlay: (item: MediaItem, episode?: Episode) => void;
  onRequest: (item: MediaItem, seasons?: number[], episode?: Episode) => void;
}

export const MediaModal: React.FC<MediaModalProps> = ({
  item,
  onClose,
  onPlay,
  onRequest,
}) => {
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [details, setDetails] = useState<MediaItem | null>(item);
  const [requestingEpId, setRequestingEpId] = useState<string | null>(null);
  const [requestedEpIds, setRequestedEpIds] = useState<Set<string>>(new Set());
  const [trailerKey, setTrailerKey] = useState<string | null>(item?.trailerKey || null);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
  const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  useEffect(() => {
    setDetails(item);
    setIsPlayingTrailer(false);
    setSelectedSeasonIndex(0);
    setTrailerKey(item?.trailerKey || null);
    if (!item) return;

    // 1. Fetch full details & seasons
    const type = item.type === 'Series' ? 'tv' : 'movie';
    fetch(`/api/media/${item.id}?type=${type}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.item) {
          setDetails(data.item);
          if (data.item.trailerKey) {
            setTrailerKey(data.item.trailerKey);
          }
        }
      })
      .catch((err) => console.error('Failed to load item details:', err));

    // 2. Fetch trailer for movie or series
    const tmdb = item.tmdbId || (item.id.startsWith('seerr-') ? Number(item.id.replace(/^seerr-(?:movie-|tv-)?/, '')) : undefined);
    fetch(`/api/trailer?tmdbId=${tmdb || ''}&type=${type}&itemId=${item.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.trailer?.key) {
          setTrailerKey(data.trailer.key);
        }
      })
      .catch(() => {});

    // 3. Fetch recommended movies / titles based on this particular film
    setIsLoadingRecs(true);
    fetch(`/api/media/${item.id}/recommendations?type=${type}&tmdbId=${tmdb || ''}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.recommendations && Array.isArray(data.recommendations)) {
          setRecommendations(data.recommendations);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoadingRecs(false));
  }, [item]);

  // Keep live track of active qBittorrent downloads while modal is open
  useEffect(() => {
    if (!item) return;
    let isMounted = true;
    const pollDl = async () => {
      try {
        const res = await fetch('/api/downloads');
        if (!res.ok) return;
        const data = await res.json();
        const dlList = data.items || [];
        const cleanTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = dlList.find((dl: any) => {
          const cleanDl = (dl.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanDl.includes(cleanTitle) || cleanTitle.includes(cleanDl);
        });
        if (matched && isMounted && item) {
          setDetails((prev) => ({
            ...(prev || item),
            isDownloading: true,
            status: 'processing',
            downloadProgress: matched.progressPercent,
            downloadSpeed: matched.downloadSpeed,
            downloadEta: matched.eta,
            torrentHash: matched.hash,
            downloadStreamUrl: matched.streamUrl || `/api/stream/download?hash=${matched.hash}`,
            videoStreamUrl: matched.streamUrl || `/api/stream/download?hash=${matched.hash}`,
          }));
        }
      } catch {}
    };

    pollDl();
    const interval = setInterval(pollDl, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [item]);

  if (!item) return null;

  const currentItem = details || item;
  const isAvailable = currentItem.status === 'available' || currentItem.source === 'jellyfin' || currentItem.source === 'demo';
  const isRequested = currentItem.status === 'requested' || currentItem.status === 'processing';
  const hasResume = Boolean(
    (currentItem.playbackPositionTicks && currentItem.playbackPositionTicks > 0) ||
    (currentItem.progressPercent && currentItem.progressPercent > 0)
  );
  const seasons: Season[] = currentItem.seasons || [];
  const currentSeason = seasons[selectedSeasonIndex] || seasons[0];

  const allEpisodes = useMemo(() => seasons.flatMap((s) => s.episodes || []), [seasons]);
  const totalEpisodesCount = allEpisodes.length;
  const watchedEpisodesCount = allEpisodes.filter((e) => e.played).length;
  const inProgressEpisodesCount = allEpisodes.filter(
    (e) => !e.played && typeof e.progressPercent === 'number' && e.progressPercent > 0
  ).length;

  const handleRequestEpisode = async (ep: Episode) => {
    const sNum = currentSeason?.seasonNumber || 1;
    const epKey = `${sNum}-${ep.episodeNumber}`;
    setRequestingEpId(epKey);
    try {
      const tmdbId = currentItem.tmdbId || (currentItem.seerrId ? Number(currentItem.seerrId) : undefined);
      if (!tmdbId) {
        onRequest(currentItem, [sNum], ep);
        return;
      }

      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: 'tv',
          mediaId: tmdbId,
          seasons: [sNum],
        }),
      });

      if (res.ok) {
        setRequestedEpIds((prev) => new Set(prev).add(epKey));
      } else {
        onRequest(currentItem, [sNum], ep);
      }
    } catch {
      onRequest(currentItem, [sNum], ep);
    } finally {
      setRequestingEpId(null);
    }
  };

  const handleRestart = () => {
    if (currentItem.type === 'Series') {
      const allEps = currentItem.seasons?.flatMap((s) => s.episodes || []) || [];
      const firstEp = allEps.find((ep) => ep.videoStreamUrl || ep.jellyfinId) || allEps[0];
      const restartItem: MediaItem = {
        ...currentItem,
        playbackPositionTicks: 0,
        progressPercent: 0,
      };
      const restartEp: Episode | undefined = firstEp ? {
        ...firstEp,
        playbackPositionTicks: 0,
      } : undefined;

      const targetId = restartEp?.jellyfinId || restartEp?.id || currentItem.playableEpisodeId || currentItem.jellyfinId || currentItem.id;
      if (targetId) {
        fetch('/api/playback/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: targetId, positionTicks: 0, isPaused: false }),
        }).catch(() => {});
      }
      onPlay(restartItem, restartEp);
    } else {
      const restartItem: MediaItem = {
        ...currentItem,
        playbackPositionTicks: 0,
        progressPercent: 0,
      };
      const targetId = currentItem.jellyfinId || currentItem.id;
      if (targetId) {
        fetch('/api/playback/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: targetId, positionTicks: 0, isPaused: false }),
        }).catch(() => {});
      }
      onPlay(restartItem);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-sm flex justify-center p-0 md:p-6 sm:items-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-[#181818] rounded-none sm:rounded-lg overflow-hidden shadow-2xl border border-neutral-800 text-white my-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-[#181818]/80 hover:bg-[#181818] border border-neutral-700 flex items-center justify-center text-white transition-colors"
          title="Close"
        >
          <X size={20} />
        </button>

        {/* Modal Hero Banner */}
        <div className="relative aspect-[16/9] max-h-[420px] w-full bg-neutral-900 overflow-hidden">
          {isPlayingTrailer && trailerKey ? (
            <div className="relative w-full h-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=1&modestbranding=1&rel=0`}
                title={`${currentItem.title} Trailer`}
                className="w-full h-full"
                allow="autoplay; encrypted-media; fullscreen"
                allowFullScreen
              />
              <button
                onClick={() => setIsPlayingTrailer(false)}
                className="absolute top-4 left-4 z-30 px-3 py-1.5 rounded-full bg-black/80 hover:bg-black text-white text-xs font-semibold backdrop-blur-sm border border-white/20 transition-colors flex items-center space-x-1.5 shadow-lg"
              >
                <X size={14} />
                <span>Close Trailer</span>
              </button>
            </div>
          ) : (
            <>
              <img
                src={currentItem.backdropUrl || currentItem.posterUrl}
                alt={currentItem.title}
                className="w-full h-full object-cover"
              />
              {/* Cinematic Gradients */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/40 to-transparent pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#181818]/60 to-transparent pointer-events-none" />
            </>
          )}

          {/* Action Row on Top of Hero */}
          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 md:left-10 z-30 space-y-2.5 sm:space-y-3 pointer-events-auto max-w-[92%] sm:max-w-none">
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white drop-shadow-md leading-tight">
              {currentItem.title}
            </h1>

            {/* In-Progress Watch Progress Bar */}
            {hasResume && typeof currentItem.progressPercent === 'number' && currentItem.progressPercent > 0 && !currentItem.played ? (
              <div className="space-y-1 pt-0.5 max-w-xs sm:max-w-sm">
                <div className="flex items-center justify-between text-xs text-neutral-300 font-medium">
                  <span className="flex items-center space-x-1 text-red-400 font-semibold">
                    <Clock size={12} />
                    <span>In Progress ({currentItem.progressPercent}%)</span>
                  </span>
                  {typeof currentItem.durationMinutes === 'number' && currentItem.durationMinutes > 0 ? (
                    <span className="text-neutral-400 text-[11px]">
                      {Math.max(1, Math.round(currentItem.durationMinutes * (1 - currentItem.progressPercent / 100)))}m left
                    </span>
                  ) : null}
                </div>
                <div className="w-full h-1.5 bg-neutral-700/80 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full transition-all duration-300"
                    style={{ width: `${currentItem.progressPercent}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex items-center space-x-2 sm:space-x-3">
              {isAvailable ? (
                <>
                  <button
                    onClick={() => {
                      const firstEp = currentItem.seasons?.flatMap((s) => s.episodes || []).find((ep) => ep.videoStreamUrl || ep.jellyfinId);
                      onPlay(currentItem, firstEp);
                    }}
                    className="flex items-center space-x-2 bg-white text-black hover:bg-neutral-200 font-bold px-5 sm:px-6 py-2 rounded transition-transform active:scale-95 shadow"
                  >
                    <Play size={18} className="fill-black" />
                    <span>{hasResume ? 'Resume' : 'Play'}</span>
                  </button>

                  <button
                    onClick={handleRestart}
                    className="flex items-center space-x-2 bg-neutral-800/90 hover:bg-neutral-700 text-white font-semibold px-4 py-2 rounded transition-all active:scale-95 border border-neutral-700 shadow"
                    title={`Restart ${currentItem.type === 'Series' ? 'from Episode 1' : 'from beginning'}`}
                  >
                    <RotateCcw size={16} />
                    <span>Restart</span>
                  </button>
                </>
              ) : currentItem.isDownloading || currentItem.downloadStreamUrl ? (
                <button
                  onClick={() => {
                    onPlay({
                      ...currentItem,
                      videoStreamUrl: currentItem.downloadStreamUrl || currentItem.videoStreamUrl,
                    });
                  }}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 sm:px-6 py-2 rounded transition-transform active:scale-95 shadow"
                >
                  <Play size={18} className="fill-white" />
                  <span>Watch In-Progress ({currentItem.downloadProgress || 0}%)</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <button
                    onClick={() => {
                      const tmdbId = currentItem.tmdbId || (currentItem.id.startsWith('seerr-') ? Number(currentItem.id.replace(/^seerr-(?:movie-|tv-)?/, '')) : undefined);
                      if (tmdbId) {
                        fetch('/api/request', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            mediaType: currentItem.type === 'Series' ? 'tv' : 'movie',
                            mediaId: tmdbId,
                            seasons: currentItem.type === 'Series' ? [1] : undefined,
                          }),
                        }).catch(console.error);
                      }
                      onPlay({
                        ...currentItem,
                        status: 'processing',
                        isDownloading: true,
                        downloadProgress: currentItem.downloadProgress || 0,
                      });
                    }}
                    className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-bold px-5 sm:px-6 py-2 rounded transition-transform active:scale-95 shadow"
                  >
                    <Play size={18} className="fill-white" />
                    <span>Download &amp; Stream</span>
                  </button>

                  <button
                    onClick={() => onRequest(currentItem)}
                    disabled={isRequested}
                    className={`flex items-center space-x-2 font-semibold px-4 py-2 rounded transition-colors border shadow ${
                      isRequested
                        ? 'bg-amber-600/30 border-amber-600/50 text-amber-300 cursor-default'
                        : 'bg-neutral-800/90 hover:bg-neutral-700 text-neutral-300 hover:text-white border-neutral-700'
                    }`}
                  >
                    {isRequested ? <Clock size={16} /> : <Download size={16} />}
                    <span>{isRequested ? 'Requested' : 'Request Only'}</span>
                  </button>
                </div>
              )}

              {/* Watch Trailer Button */}
              {trailerKey && !isPlayingTrailer && (
                <button
                  onClick={() => setIsPlayingTrailer(true)}
                  className="flex items-center space-x-1.5 bg-neutral-800/90 hover:bg-neutral-700 text-white font-semibold px-4 py-2 rounded transition-all active:scale-95 border border-neutral-700 shadow"
                  title="Watch Official Trailer"
                >
                  <Film size={16} className="text-red-500" />
                  <span>Trailer</span>
                </button>
              )}

              <button
                onClick={() => setIsFavorite(!isFavorite)}
                className="w-10 h-10 rounded-full border-2 border-gray-400 hover:border-white text-white flex items-center justify-center transition-colors"
                title={isFavorite ? 'Remove from My List' : 'Add to My List'}
              >
                {isFavorite ? <Check size={18} /> : <Plus size={18} />}
              </button>

              <button
                className="w-10 h-10 rounded-full border-2 border-gray-400 hover:border-white text-white flex items-center justify-center transition-colors"
                title="Like"
              >
                <ThumbsUp size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body: Two Columns */}
        <div className="p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8 pb-16 sm:pb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Left Column: Metadata & Overview */}
            <div className="md:col-span-2 space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-gray-300">
                <span className="text-emerald-400 font-bold">{currentItem.matchPercentage || 98}% Match</span>
                {currentItem.year && <span>{currentItem.year}</span>}
                <span className="border border-neutral-600 px-1.5 py-0.5 text-xs rounded text-gray-300">
                  {currentItem.rating || 'TV-MA'}
                </span>
                {typeof currentItem.seasonsCount === 'number' && currentItem.seasonsCount > 0 ? (
                  <span>{currentItem.seasonsCount} Season{currentItem.seasonsCount > 1 ? 's' : ''}</span>
                ) : null}
                {typeof currentItem.durationMinutes === 'number' && currentItem.durationMinutes > 0 ? (
                  <span>{Math.floor(currentItem.durationMinutes / 60)}h {currentItem.durationMinutes % 60}m</span>
                ) : null}
                {/* Dynamic Resolution & HDR Badges */}
                {currentItem.resolution && (
                  <span className="border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-300">
                    {currentItem.resolution}
                  </span>
                )}
                {currentItem.hasHdr && (
                  <span className="border border-amber-500/70 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-400 font-bold bg-amber-950/30">
                    HDR
                  </span>
                )}
                {/* Dynamic Audio Quality Badge */}
                {currentItem.audioQuality && (
                  <span className="border border-neutral-700 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-300">
                    {currentItem.audioQuality}
                  </span>
                )}
                {currentItem.source === 'seerr' && !currentItem.resolution && (
                  <span className="border border-neutral-800 text-[10px] px-1.5 py-0.5 rounded font-mono text-neutral-400">
                    HD Available
                  </span>
                )}

                {/* Watched Status Badges */}
                {currentItem.played ? (
                  <span className="flex items-center space-x-1 text-xs font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-700/80 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} />
                    <span>Watched</span>
                  </span>
                ) : null}
                {!currentItem.played && hasResume && typeof currentItem.progressPercent === 'number' && currentItem.progressPercent > 0 ? (
                  <span className="flex items-center space-x-1 text-xs font-semibold text-red-400 bg-red-950/70 border border-red-700/80 px-2.5 py-0.5 rounded-full">
                    <Clock size={13} />
                    <span>{currentItem.progressPercent}% Watched</span>
                  </span>
                ) : null}
                {currentItem.type === 'Series' && totalEpisodesCount > 0 && watchedEpisodesCount > 0 ? (
                  <span className="flex items-center space-x-1 text-xs font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-700/80 px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 size={13} />
                    <span>{watchedEpisodesCount}/{totalEpisodesCount} Watched</span>
                  </span>
                ) : null}
              </div>

              {/* Status Banner */}
              <div className="flex items-center space-x-2 text-xs py-1.5 px-3 rounded bg-neutral-900 border border-neutral-800">
                {isAvailable ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    <span className="text-emerald-400 font-medium">
                      Available on your Jellyfin server. Instant playback ready.
                    </span>
                  </>
                ) : currentItem.isDownloading ? (
                  <>
                    <Download size={16} className="text-blue-400 shrink-0 animate-pulse" />
                    <span className="text-blue-300 font-medium">
                      Currently downloading ({currentItem.downloadProgress || 0}%). Stream in-progress is ready to watch!
                    </span>
                  </>
                ) : isRequested ? (
                  <>
                    <Clock size={16} className="text-amber-500 shrink-0" />
                    <span className="text-amber-400 font-medium">
                      Requested on Seerr. Sonarr/Radarr is actively fetching this media.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} className="text-blue-400 shrink-0" />
                    <span className="text-blue-300 font-medium">
                      Not currently on Jellyfin. Click &quot;Request via Seerr&quot; to download automatically.
                    </span>
                  </>
                )}
              </div>

              <p className="text-neutral-200 text-sm md:text-base leading-relaxed">
                {currentItem.overview}
              </p>
            </div>

            {/* Right Column: Cast, Genres, Creators */}
            <div className="space-y-3 text-sm text-neutral-400">
              {currentItem.cast && currentItem.cast.length > 0 && (
                <div>
                  <span className="text-neutral-500">Cast: </span>
                  <span className="text-neutral-300">
                    {currentItem.cast.slice(0, 4).map((c) => c.name).join(', ')}
                  </span>
                </div>
              )}

              {currentItem.genres && currentItem.genres.length > 0 && (
                <div>
                  <span className="text-neutral-500">Genres: </span>
                  <span className="text-neutral-300">{currentItem.genres.join(', ')}</span>
                </div>
              )}

              {currentItem.director && (
                <div>
                  <span className="text-neutral-500">Director / Creator: </span>
                  <span className="text-neutral-300">{currentItem.director}</span>
                </div>
              )}

              <div>
                <span className="text-neutral-500">Source: </span>
                <span className="text-neutral-300 capitalize">{currentItem.source}</span>
              </div>
            </div>
          </div>

          {/* TV Show Seasons & Episodes Section */}
          {(seasons.length > 0 || currentItem.type === 'Series' || currentItem.type === 'Episode') && (
            <div className="pt-6 border-t border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h3 className="text-xl font-bold text-white">Episodes</h3>
                  {currentSeason?.episodes && currentSeason.episodes.length > 0 && (
                    <span className="text-xs text-neutral-400 font-medium">
                      ({currentSeason.episodes.filter((e) => e.played).length}/{currentSeason.episodes.length} watched)
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {/* Download Season Button for Requestable Shows */}
                  {!isAvailable && currentSeason && (
                    <button
                      onClick={() => onRequest(currentItem, [currentSeason.seasonNumber])}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors shadow-sm"
                      title={`Request Season ${currentSeason.seasonNumber}`}
                    >
                      <Download size={13} className="text-red-500" />
                      <span>Download Season {currentSeason.seasonNumber}</span>
                    </button>
                  )}

                  {/* Season Dropdown */}
                  {seasons.length > 1 && (
                    <select
                      value={selectedSeasonIndex}
                      onChange={(e) => setSelectedSeasonIndex(Number(e.target.value))}
                      className="bg-[#242424] border border-neutral-700 text-white text-sm font-semibold rounded px-3 py-1.5 outline-none cursor-pointer hover:bg-neutral-800"
                    >
                      {seasons.map((s, idx) => (
                        <option key={s.id || idx} value={idx}>
                          {s.name || `Season ${s.seasonNumber}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Episode List */}
              <div className="space-y-3">
                {currentSeason?.episodes && currentSeason.episodes.length > 0 ? (
                  currentSeason.episodes.map((ep) => {
                    const epKey = `${currentSeason?.seasonNumber || 1}-${ep.episodeNumber}`;
                    const isEpRequested = requestedEpIds.has(epKey) || isRequested;
                    const isEpRequesting = requestingEpId === epKey;
                    const isTorrentDownloading = Boolean(currentItem.isDownloading || currentItem.downloadStreamUrl || ep.downloadStreamUrl);
                    const canPlayEp = (isAvailable && Boolean(ep.videoStreamUrl || ep.jellyfinId)) || isTorrentDownloading;

                    return (
                      <div
                        key={ep.id}
                        onClick={() => {
                          if (canPlayEp) {
                            if (isTorrentDownloading) {
                              const hash = currentItem.torrentHash || (currentItem.downloadStreamUrl?.match(/hash=([^&]+)/)?.[1]);
                              const sNum = currentSeason?.seasonNumber || 1;
                              const epNum = ep.episodeNumber;
                              const epStreamUrl = hash
                                ? `/api/stream/download?hash=${hash}&season=${sNum}&episode=${epNum}`
                                : currentItem.downloadStreamUrl;

                              onPlay({
                                ...currentItem,
                                isDownloading: true,
                                downloadStreamUrl: epStreamUrl,
                                videoStreamUrl: epStreamUrl,
                              }, {
                                ...ep,
                                videoStreamUrl: epStreamUrl,
                              });
                            } else {
                              onPlay(currentItem, ep);
                            }
                          } else {
                            handleRequestEpisode(ep);
                          }
                        }}
                        className="flex items-center justify-between p-3 rounded-lg bg-neutral-900/60 hover:bg-neutral-800/80 cursor-pointer transition-colors border border-neutral-800/80 group"
                      >
                        <div className="flex items-center space-x-4 min-w-0">
                          <span className="text-base font-bold text-neutral-400 group-hover:text-white w-6 text-center shrink-0">
                            {ep.episodeNumber}
                          </span>

                          {/* Thumbnail */}
                          <div className="relative w-28 sm:w-36 aspect-video bg-neutral-800 rounded overflow-hidden shrink-0">
                            <img
                              src={ep.thumbnailUrl || currentItem.backdropUrl}
                              alt={ep.name}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 flex items-center justify-center transition-colors">
                              {canPlayEp ? (
                                <Play size={20} className="text-white fill-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                              ) : isEpRequested ? (
                                <Check size={20} className="text-amber-400 font-bold" />
                              ) : (
                                <Download size={20} className="text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                              )}
                            </div>

                            {/* Watched Badge on Thumbnail */}
                            {ep.played && (
                              <div className="absolute top-1.5 right-1.5 z-10 bg-emerald-600/95 text-white rounded-full p-0.5 shadow-md border border-emerald-400/40">
                                <Check size={11} strokeWidth={3} />
                              </div>
                            )}

                            {/* Progress bar across bottom of thumbnail for half-watched or watched */}
                            {ep.played ? (
                              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-emerald-500/90" />
                            ) : typeof ep.progressPercent === 'number' && ep.progressPercent > 0 ? (
                              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-neutral-900/90 overflow-hidden">
                                <div
                                  className="h-full bg-red-600 transition-all duration-300 shadow"
                                  style={{ width: `${ep.progressPercent}%` }}
                                />
                              </div>
                            ) : null}
                          </div>

                          {/* Episode details */}
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold text-white group-hover:text-red-500 transition-colors truncate">
                                {ep.name}
                              </h4>
                              {ep.played ? (
                                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-800/80 px-1.5 py-0.5 rounded">
                                  Watched
                                </span>
                              ) : null}
                              {!ep.played && typeof ep.progressPercent === 'number' && ep.progressPercent > 0 ? (
                                <span className="text-[10px] font-semibold text-red-400 bg-red-950/70 border border-red-800/80 px-1.5 py-0.5 rounded">
                                  {ep.progressPercent}% watched
                                </span>
                              ) : null}
                              {isTorrentDownloading && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-950/70 text-blue-400 border border-blue-800/80 flex items-center space-x-1">
                                  <Download size={10} className="animate-bounce" />
                                  <span>Stream In-Progress</span>
                                </span>
                              )}
                              {!canPlayEp && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  isEpRequested
                                    ? 'bg-amber-950/70 text-amber-400 border border-amber-800/80'
                                    : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                                }`}>
                                  {isEpRequested ? 'Requested' : 'Available for Download'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 line-clamp-2 max-w-lg">
                              {ep.overview}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0 pl-2">
                          {canPlayEp ? (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const restartEp: Episode = { ...ep, playbackPositionTicks: 0 };
                                  fetch('/api/playback/progress', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ itemId: ep.jellyfinId || ep.id, positionTicks: 0, isPaused: false }),
                                  }).catch(() => {});
                                  onPlay({ ...currentItem, playbackPositionTicks: 0 }, restartEp);
                                }}
                                className="p-1.5 rounded-full hover:bg-white/20 text-neutral-400 hover:text-white transition-colors"
                                title={`Restart Episode ${ep.episodeNumber} from 0:00`}
                              >
                                <RotateCcw size={15} />
                              </button>
                              <div className="text-xs text-neutral-400 font-mono">
                                {ep.durationMinutes}m
                              </div>
                            </>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRequestEpisode(ep);
                              }}
                              disabled={isEpRequested || isEpRequesting}
                              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all shadow ${
                                isEpRequested
                                  ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50 cursor-default'
                                  : isEpRequesting
                                  ? 'bg-neutral-700 text-white cursor-wait'
                                  : 'bg-red-600 hover:bg-red-500 text-white active:scale-95'
                              }`}
                              title={`Download Episode ${ep.episodeNumber}`}
                            >
                              {isEpRequesting ? (
                                <>
                                  <Clock size={13} className="animate-spin" />
                                  <span>Requesting...</span>
                                </>
                              ) : isEpRequested ? (
                                <>
                                  <Check size={13} />
                                  <span>Requested</span>
                                </>
                              ) : (
                                <>
                                  <Download size={13} />
                                  <span>Download</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-sm text-neutral-400 italic py-4">
                    Loading seasons and episodes...
                  </div>
                )}
              </div>
            </div>
          )}

          {/* More Like This / Recommended Section */}
          {recommendations.length > 0 && (
            <div className="pt-6 border-t border-neutral-800 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">More Like This</h3>
                  <p className="text-xs text-neutral-400">
                    Recommended based on {currentItem.title}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {recommendations.slice(0, 6).map((rec) => {
                  const recAvailable = rec.status === 'available' || rec.source === 'jellyfin';
                  const recRequested = rec.status === 'requested' || rec.status === 'processing';

                  return (
                    <div
                      key={rec.id}
                      onClick={() => {
                        setDetails(rec);
                        setIsPlayingTrailer(false);
                      }}
                      className="rounded-md bg-neutral-900 border border-neutral-800 overflow-hidden cursor-pointer hover:border-neutral-600 transition-all group flex flex-col justify-between"
                    >
                      {/* Thumbnail with Status Badge */}
                      <div className="relative aspect-video w-full bg-neutral-950 overflow-hidden">
                        <img
                          src={rec.backdropUrl || rec.posterUrl}
                          alt={rec.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                        <div className="absolute top-2 right-2 z-10">
                          {recAvailable ? (
                            <span className="bg-emerald-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm">
                              ON JELLYFIN
                            </span>
                          ) : recRequested ? (
                            <span className="bg-amber-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm flex items-center space-x-1">
                              <Clock size={9} />
                              <span>REQUESTED</span>
                            </span>
                          ) : (
                            <span className="bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm flex items-center space-x-1">
                              <Download size={9} />
                              <span>DOWNLOAD</span>
                            </span>
                          )}
                        </div>

                        {/* Title overlay */}
                        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent">
                          <h4 className="text-white text-xs font-bold truncate drop-shadow">
                            {rec.title}
                          </h4>
                        </div>
                      </div>

                      {/* Details & Actions */}
                      <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2 text-[11px] font-semibold">
                            <span className="text-emerald-400">{rec.matchPercentage || 94}% Match</span>
                            <span className="border border-neutral-700 px-1 py-0.2 rounded text-[10px] text-neutral-300">
                              {rec.rating || 'PG-13'}
                            </span>
                            {rec.year && <span className="text-neutral-400">{rec.year}</span>}
                          </div>
                          <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed">
                            {rec.overview}
                          </p>
                        </div>

                        {/* Action button */}
                        <div className="pt-2">
                          {recAvailable ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onPlay(rec);
                              }}
                              className="w-full py-1.5 bg-white hover:bg-neutral-200 text-black font-bold text-xs rounded flex items-center justify-center space-x-1.5 transition-colors shadow"
                            >
                              <Play size={13} className="fill-black" />
                              <span>Watch Now</span>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onRequest(rec);
                              }}
                              disabled={recRequested}
                              className={`w-full py-1.5 font-bold text-xs rounded flex items-center justify-center space-x-1.5 transition-colors shadow ${
                                recRequested
                                  ? 'bg-amber-600/30 text-amber-300 border border-amber-600/40 cursor-default'
                                  : 'bg-red-600 hover:bg-red-500 text-white'
                              }`}
                            >
                              {recRequested ? <Check size={13} /> : <Download size={13} />}
                              <span>{recRequested ? 'Requested' : 'Download via Seerr'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Request Section for Unindexed Media */}
          {!isAvailable && (
            <div className="pt-6 border-t border-neutral-800 p-5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-white text-base">Want to watch this title?</h4>
                <p className="text-xs text-neutral-400">
                  Request it through Seerr to have your automated downloader (Sonarr/Radarr) acquire it.
                </p>
              </div>
              <button
                onClick={() => onRequest(currentItem)}
                disabled={isRequested}
                className={`px-5 py-2.5 rounded font-bold text-sm flex items-center space-x-2 shrink-0 ${
                  isRequested
                    ? 'bg-amber-600 text-white cursor-not-allowed opacity-80'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
              >
                {isRequested ? <Clock size={16} /> : <Download size={16} />}
                <span>{isRequested ? 'Download In Progress' : 'Download via Seerr'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
