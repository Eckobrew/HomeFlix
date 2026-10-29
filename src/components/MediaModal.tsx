'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Play,
  RotateCcw,
  Plus,
  Check,
  Download,
  ThumbsUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { MediaItem, Season, Episode } from '@/types';

interface MediaModalProps {
  item: MediaItem | null;
  onClose: () => void;
  onPlay: (item: MediaItem, episode?: Episode) => void;
  onRequest: (item: MediaItem, seasons?: number[]) => void;
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

  useEffect(() => {
    setDetails(item);
    if (!item) return;

    // Load full details & episodes from API if item is from Jellyfin
    const fetchFullDetails = async () => {
      try {
        const res = await fetch(`/api/media/${item.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.item) {
            setDetails(data.item);
          }
        }
      } catch (err) {
        console.error('Failed to load item details:', err);
      }
    };

    fetchFullDetails();
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
        <div className="relative aspect-[16/9] max-h-[420px] w-full bg-neutral-900">
          <img
            src={currentItem.backdropUrl || currentItem.posterUrl}
            alt={currentItem.title}
            className="w-full h-full object-cover"
          />
          {/* Cinematic Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-[#181818]/40 to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#181818]/60 to-transparent pointer-events-none" />

          {/* Action Row on Top of Hero */}
          <div className="absolute bottom-4 left-4 sm:bottom-6 sm:left-6 md:left-10 z-30 space-y-2.5 sm:space-y-3 pointer-events-auto max-w-[92%] sm:max-w-none">
            <h1 className="text-xl sm:text-3xl md:text-4xl font-black text-white drop-shadow-md leading-tight">
              {currentItem.title}
            </h1>

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
              ) : (
                <button
                  onClick={() => onRequest(currentItem)}
                  disabled={isRequested}
                  className={`flex items-center space-x-2 font-bold px-6 py-2 rounded transition-colors shadow ${
                    isRequested
                      ? 'bg-amber-600/80 text-white cursor-default'
                      : 'bg-red-600 hover:bg-red-500 text-white'
                  }`}
                >
                  {isRequested ? <Clock size={18} /> : <Download size={18} />}
                  <span>{isRequested ? 'Requested (Downloading)' : 'Request via Seerr'}</span>
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
                {typeof currentItem.seasonsCount === 'number' && currentItem.seasonsCount > 0 && (
                  <span>{currentItem.seasonsCount} Season{currentItem.seasonsCount > 1 ? 's' : ''}</span>
                )}
                {typeof currentItem.durationMinutes === 'number' && currentItem.durationMinutes > 0 && (
                  <span>{Math.floor(currentItem.durationMinutes / 60)}h {currentItem.durationMinutes % 60}m</span>
                )}
                <span className="border border-neutral-700 text-[10px] px-1 py-0.5 rounded font-mono text-neutral-400">
                  Ultra HD 4K
                </span>
                <span className="border border-neutral-700 text-[10px] px-1 py-0.5 rounded font-mono text-neutral-400">
                  5.1 Audio
                </span>
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
                <h3 className="text-xl font-bold text-white">Episodes</h3>

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

              {/* Episode List */}
              <div className="space-y-3">
                {currentSeason?.episodes && currentSeason.episodes.length > 0 ? (
                  currentSeason.episodes.map((ep) => (
                    <div
                      key={ep.id}
                      onClick={() => onPlay(currentItem, ep)}
                      className="flex items-center justify-between p-3 rounded-lg bg-neutral-900/60 hover:bg-neutral-800/80 cursor-pointer transition-colors border border-neutral-800/80 group"
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-base font-bold text-neutral-400 group-hover:text-white w-6 text-center">
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
                            <Play size={20} className="text-white fill-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                          </div>
                        </div>

                        {/* Episode details */}
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-bold text-white group-hover:text-red-500 transition-colors">
                              {ep.name}
                            </h4>
                          </div>
                          <p className="text-xs text-neutral-400 line-clamp-2 max-w-lg">
                            {ep.overview}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0 pl-2">
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
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-neutral-400 italic py-4">
                    Loading seasons and episodes...
                  </div>
                )}
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
