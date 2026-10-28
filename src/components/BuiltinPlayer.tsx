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
  Subtitles,
  Check,
  X,
  AlertCircle,
} from 'lucide-react';
import { MediaItem, Episode, SubtitleTrack } from '@/types';

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
  const [buffered, setBuffered] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);

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

  // Fetch available subtitles for active playable ID
  useEffect(() => {
    if (!activePlayableId) return;
    setIsLoadingSubtitles(true);
    fetch(`/api/subtitles?itemId=${activePlayableId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.subtitles)) {
          setSubtitles(data.subtitles);
          // If a track is marked default, select it
          const def = data.subtitles.find((s: SubtitleTrack) => s.isDefault && !s.isForced);
          if (def) {
            setSelectedSubtitleId(def.id);
          }
        }
      })
      .catch((err) => console.error('Failed to load subtitles:', err))
      .finally(() => setIsLoadingSubtitles(false));
  }, [activePlayableId]);

  // Synchronize textTracks mode with selectedSubtitleId
  useEffect(() => {
    if (!videoRef.current || !videoRef.current.textTracks) return;
    const tracks = videoRef.current.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const match = subtitles.find((s) => s.id === selectedSubtitleId);
      if (match && track.label === match.title) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  }, [selectedSubtitleId, subtitles]);

  // Determine media stream URL
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

  // Auto-hide controls timer
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !showSubtitleMenu) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, showSubtitleMenu]);

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

      // Auto-resume from previous playback position
      let resumeSeconds = 0;
      if (activeEpisode?.playbackPositionTicks && activeEpisode.playbackPositionTicks > 0) {
        resumeSeconds = Math.floor(activeEpisode.playbackPositionTicks / 10000000);
      } else if (item.playbackPositionTicks && item.playbackPositionTicks > 0) {
        resumeSeconds = Math.floor(item.playbackPositionTicks / 10000000);
      }

      if (resumeSeconds > 0 && resumeSeconds < videoRef.current.duration - 5) {
        videoRef.current.currentTime = resumeSeconds;
      }

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
      if (e.key === 'c' || e.key === 'C') {
        setShowSubtitleMenu((prev) => !prev);
      }
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
            <AlertCircle size={32} />
          </div>
          <h3 className="text-xl font-bold text-white">Playback Error</h3>
          <p className="text-sm text-gray-400 max-w-md">
            Unable to stream this media. Verify your server is online and the media file is accessible.
          </p>
          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={() => {
                setStreamError(false);
                if (videoRef.current) {
                  videoRef.current.load();
                  videoRef.current.play().catch(console.error);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded transition-all shadow-lg"
            >
              Retry Playback
            </button>
            <button
              onClick={onClose}
              className="bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-semibold px-4 py-2.5 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* HTML5 Stream Player */}
      <div className="relative w-full h-full flex items-center justify-center" onClick={togglePlay}>
        <video
          ref={videoRef}
          src={streamUrl}
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onError={() => {
            setStreamError(true);
            setIsPlaying(false);
          }}
          className="w-full h-full object-contain cursor-pointer"
          playsInline
        >
          {subtitles.map((sub) => (
            <track
              key={sub.id}
              id={`sub-${sub.id}`}
              kind="subtitles"
              src={sub.src}
              srcLang={sub.language}
              label={sub.title}
              default={sub.isDefault}
            />
          ))}
        </video>
      </div>

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
              title="Back (Esc)"
            >
              <ArrowLeft size={28} />
            </button>
            <div className="space-y-0.5">
              <h2 className="text-white font-bold text-lg md:text-xl drop-shadow">
                {item.title}
              </h2>
              {activeEpisode && (
                <p className="text-neutral-400 text-xs md:text-sm font-medium">
                  Season {activeEpisode.seasonNumber}, Episode {activeEpisode.episodeNumber}: {activeEpisode.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Controls Bar */}
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

            {/* Right: Subtitles, Next Episode, Fullscreen */}
            <div className="flex items-center space-x-4 md:space-x-5 relative">
              {/* Subtitles Button & Popover */}
              <div className="relative">
                <button
                  onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                  className={`transition-colors p-1 rounded hover:text-white ${
                    selectedSubtitleId ? 'text-red-500' : 'text-neutral-300 hover:text-white'
                  }`}
                  title="Subtitles (C)"
                >
                  <Subtitles size={22} />
                </button>

                {/* Subtitles Selection Popup Menu */}
                {showSubtitleMenu && (
                  <div
                    className="absolute right-0 bottom-10 bg-neutral-900/95 border border-neutral-700/80 rounded-lg shadow-2xl p-3 min-w-[220px] max-h-[320px] overflow-y-auto z-50 animate-fade-in backdrop-blur-md"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2 px-2 flex items-center justify-between">
                      <span>Subtitles</span>
                      <button
                        onClick={() => setShowSubtitleMenu(false)}
                        className="hover:text-white text-neutral-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          setSelectedSubtitleId(null);
                          setShowSubtitleMenu(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${
                          selectedSubtitleId === null
                            ? 'bg-red-600/20 text-red-500 font-semibold'
                            : 'text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <span>Off</span>
                        {selectedSubtitleId === null && <Check size={16} />}
                      </button>

                      {subtitles.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => {
                            setSelectedSubtitleId(sub.id);
                            setShowSubtitleMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded text-sm flex items-center justify-between transition-colors ${
                            selectedSubtitleId === sub.id
                              ? 'bg-red-600/20 text-red-500 font-semibold'
                              : 'text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span className="truncate pr-2">{sub.title}</span>
                          {selectedSubtitleId === sub.id && <Check size={16} />}
                        </button>
                      ))}

                      {subtitles.length === 0 && !isLoadingSubtitles && (
                        <div className="text-xs text-neutral-500 px-3 py-2 italic">
                          No subtitle tracks available
                        </div>
                      )}

                      {isLoadingSubtitles && (
                        <div className="text-xs text-neutral-400 px-3 py-2 flex items-center space-x-2">
                          <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          <span>Loading tracks...</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

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
      </div>
    </div>
  );
};
