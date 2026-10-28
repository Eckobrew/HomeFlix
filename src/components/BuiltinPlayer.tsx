'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipForward,
  ExternalLink,
  Layers,
  MonitorPlay,
} from 'lucide-react';
import { MediaItem, Episode } from '@/types';

interface BuiltinPlayerProps {
  item: MediaItem;
  episode?: Episode;
  onClose: () => void;
  onNextEpisode?: () => void;
  jellyfinServerUrl?: string;
  jellyfinApiKey?: string;
}

export const BuiltinPlayer: React.FC<BuiltinPlayerProps> = ({
  item,
  episode,
  onClose,
  onNextEpisode,
  jellyfinServerUrl,
  jellyfinApiKey,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [playerMode, setPlayerMode] = useState<'builtin' | 'jellyfin_embed'>('builtin');
  const [buffered, setBuffered] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);

  // Active episode / target ID
  const [activeEpisode, setActiveEpisode] = useState<Episode | undefined>(episode);
  const [activePlayableId, setActivePlayableId] = useState<string | undefined>(
    episode?.jellyfinId ||
    episode?.id ||
    item.playableEpisodeId ||
    (item.type !== 'Series' ? (item.jellyfinId || item.id) : undefined)
  );

  const isJellyfinItem = Boolean(item.source === 'jellyfin' || item.jellyfinId);

  // If item is a series and no playable episode is resolved yet, fetch series seasons/episodes
  useEffect(() => {
    if (item.type === 'Series' && !activePlayableId) {
      if (item.seasons && item.seasons.length > 0) {
        const firstEp = item.seasons.flatMap((s) => s.episodes || []).find((ep) => ep.videoStreamUrl || ep.jellyfinId);
        if (firstEp) {
          setActiveEpisode(firstEp);
          setActivePlayableId(firstEp.jellyfinId || firstEp.id);
          return;
        }
      }

      setIsLoadingEpisode(true);
      fetch(`/api/media/${item.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.item?.playableEpisodeId) {
            setActivePlayableId(data.item.playableEpisodeId);
          }
          if (data.item?.seasons) {
            const firstEp = data.item.seasons.flatMap((s: any) => s.episodes || []).find((ep: any) => ep.videoStreamUrl || ep.jellyfinId);
            if (firstEp) {
              setActiveEpisode(firstEp);
              setActivePlayableId(firstEp.jellyfinId || firstEp.id);
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingEpisode(false));
    }
  }, [item, activePlayableId]);

  // Determine media stream URL (use .stream.mp4 for universal browser playback)
  let streamUrl = activeEpisode?.videoStreamUrl || '';
  if (!streamUrl && isJellyfinItem && jellyfinServerUrl && jellyfinApiKey && activePlayableId) {
    const cleanUrl = jellyfinServerUrl.replace(/\/+$/, '');
    streamUrl = `${cleanUrl}/Videos/${activePlayableId}/stream.mp4?static=true&api_key=${jellyfinApiKey}`;
  }
  if (!streamUrl && item.type !== 'Series' && item.videoStreamUrl) {
    streamUrl = item.videoStreamUrl;
  }
  if (!streamUrl && !isJellyfinItem) {
    streamUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
  }

  // Jellyfin native web client URL
  const jellyfinWebTargetId = activePlayableId || item.jellyfinId || item.id;
  const jellyfinWebUrl = (jellyfinServerUrl && jellyfinWebTargetId)
    ? `${jellyfinServerUrl.replace(/\/+$/, '')}/web/index.html#!/details?id=${jellyfinWebTargetId}`
    : '';

  // Auto-hide controls timer
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [resetControlsTimer]);

  // Video event handlers
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      if (videoRef.current.buffered.length > 0) {
        const buffEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
        setBuffered((buffEnd / videoRef.current.duration) * 100);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.play().catch(() => setIsPlaying(false));
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
      setShowControls(true);
    } else {
      videoRef.current.play();
      setIsPlaying(true);
      resetControlsTimer();
    }
  };

  const seek = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.currentTime + seconds, duration));
    resetControlsTimer();
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowLeft') seek(-10);
      if (e.key === 'ArrowRight') seek(10);
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'm') toggleMute();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration]);

  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentTitle = activeEpisode
    ? `${item.title}: S${activeEpisode.seasonNumber}E${activeEpisode.episodeNumber} - ${activeEpisode.name}`
    : item.title;

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden cursor-auto"
    >
      {/* Loading Episode Indicator */}
      {isLoadingEpisode && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-40 space-y-3">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-400">Loading series episode...</span>
        </div>
      )}

      {/* Stream Error Dialog */}
      {streamError && (
        <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center p-6 text-center z-40 space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500">
            <MonitorPlay size={32} />
          </div>
          <h3 className="text-xl font-bold text-white">Browser Stream Transcoding Required</h3>
          <p className="text-sm text-gray-400 max-w-md">
            This video stream requires container remuxing or an unsupported audio codec. Switch to the embedded Jellyfin player for direct playback.
          </p>
          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={() => {
                setStreamError(false);
                setPlayerMode('jellyfin_embed');
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded transition-all shadow-lg"
            >
              Open in Jellyfin Player
            </button>
            <button
              onClick={() => {
                setStreamError(false);
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(console.error);
                }
              }}
              className="bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-semibold px-4 py-2.5 rounded transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher View */}
      {playerMode === 'builtin' ? (
        /* HomeFlix HTML5 Stream Player */
        <div className="relative w-full h-full flex items-center justify-center" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={streamUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={() => {
              setStreamError(true);
            }}
            onEnded={() => {
              setIsPlaying(false);
              if (onNextEpisode) onNextEpisode();
            }}
            className="w-full h-full object-contain"
            playsInline
            autoPlay
          />

          {/* Big Center Play/Pause indicator on click */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/40">
              <div className="w-20 h-20 rounded-full bg-black/70 border border-white/20 flex items-center justify-center shadow-2xl backdrop-blur-sm">
                <Play size={40} className="fill-white text-white ml-1.5" />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Jellyfin Embedded Native Client */
        <div className="relative w-full h-full bg-neutral-900">
          {jellyfinWebUrl ? (
            <iframe
              src={jellyfinWebUrl}
              className="w-full h-full border-none"
              allow="autoplay; fullscreen; encrypted-media"
              title="Jellyfin Native Player"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
              <MonitorPlay size={48} className="text-red-600" />
              <h3 className="text-xl font-bold text-white">Jellyfin Server URL Not Configured</h3>
              <p className="text-sm text-gray-400 max-w-md">
                Configure your Jellyfin URL in HomeFlix Settings to use the embedded native web player.
              </p>
              <button
                onClick={() => setPlayerMode('builtin')}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded"
              >
                Switch to HomeFlix Built-in Player
              </button>
            </div>
          )}
        </div>
      )}

      {/* Web Player Overlay Controls */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-300 flex flex-col justify-between ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Bar */}
        <div className="p-6 md:p-8 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto">
          {/* Back button + Media Title */}
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/20 text-white transition-colors"
              title="Back to HomeFlix (Esc)"
            >
              <ArrowLeft size={28} />
            </button>
            <div className="space-y-0.5">
              <h2 className="text-white font-bold text-lg md:text-xl drop-shadow">
                {item.title}
              </h2>
              {episode && (
                <p className="text-neutral-400 text-xs md:text-sm font-medium">
                  Season {episode.seasonNumber}, Episode {episode.episodeNumber}: {episode.name}
                </p>
              )}
            </div>
          </div>

          {/* Player Mode Switcher Toggle */}
          <div className="flex items-center space-x-3">
            {jellyfinWebUrl && (
              <a
                href={jellyfinWebUrl}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:flex items-center space-x-1.5 text-xs text-gray-300 hover:text-white bg-black/60 border border-neutral-700 px-3 py-1.5 rounded-full transition-colors"
                title="Open in new Jellyfin tab"
              >
                <ExternalLink size={14} />
                <span>Open in Jellyfin</span>
              </a>
            )}

            <button
              onClick={() => setPlayerMode(playerMode === 'builtin' ? 'jellyfin_embed' : 'builtin')}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-800/90 hover:bg-neutral-700 border border-neutral-600 text-white transition-colors shadow"
              title="Toggle between HomeFlix player and Jellyfin embedded player"
            >
              <Layers size={14} />
              <span>{playerMode === 'builtin' ? 'Switch to Jellyfin Web' : 'Switch to HomeFlix Player'}</span>
            </button>
          </div>
        </div>

        {/* Bottom Controls Bar */}
        {playerMode === 'builtin' && (
          <div
            className="p-6 md:p-8 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-auto space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Timeline Scrubber */}
            <div className="relative group/scrubber cursor-pointer w-full flex items-center">
              {/* Buffer Bar */}
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-neutral-700 rounded-full"
                style={{ width: `${buffered}%` }}
              />

              {/* Progress Slider */}
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleScrub}
                className="w-full h-1 bg-neutral-600 rounded-lg appearance-none cursor-pointer accent-red-600 group-hover/scrubber:h-2 transition-all"
              />
            </div>

            {/* Controls Row */}
            <div className="flex items-center justify-between text-white pt-1">
              {/* Left: Play/Pause, Rewind, Forward, Volume, Time */}
              <div className="flex items-center space-x-4 md:space-x-6">
                <button
                  onClick={togglePlay}
                  className="hover:text-red-500 transition-colors"
                  title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} className="fill-white" />}
                </button>

                <button
                  onClick={() => seek(-10)}
                  className="hover:text-neutral-300 transition-colors"
                  title="Rewind 10 seconds"
                >
                  <RotateCcw size={22} />
                </button>

                <button
                  onClick={() => seek(10)}
                  className="hover:text-neutral-300 transition-colors"
                  title="Fast forward 10 seconds"
                >
                  <RotateCw size={22} />
                </button>

                {/* Volume control */}
                <div className="flex items-center space-x-2 group/volume">
                  <button onClick={toggleMute} className="hover:text-neutral-300 transition-colors">
                    {isMuted || volume === 0 ? <VolumeX size={22} /> : <Volume2 size={22} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/volume:w-20 transition-all duration-300 h-1 bg-neutral-600 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>

                {/* Time Display */}
                <div className="text-xs md:text-sm font-mono text-neutral-300">
                  <span>{formatTime(currentTime)}</span>
                  <span className="mx-1 text-neutral-500">/</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Center: Title on Mobile/Tablet */}
              <div className="hidden lg:block text-sm font-semibold text-neutral-300 truncate max-w-md">
                {currentTitle}
              </div>

              {/* Right: Next Episode, Fullscreen */}
              <div className="flex items-center space-x-4 md:space-x-5">
                {onNextEpisode && (
                  <button
                    onClick={onNextEpisode}
                    className="flex items-center space-x-1.5 hover:text-neutral-300 transition-colors text-sm font-semibold"
                    title="Next Episode"
                  >
                    <SkipForward size={20} />
                    <span className="hidden sm:inline">Next Episode</span>
                  </button>
                )}

                <button
                  onClick={toggleFullscreen}
                  className="hover:text-neutral-300 transition-colors"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
