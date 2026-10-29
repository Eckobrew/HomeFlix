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
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [streamError, setStreamError] = useState(false);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(true);
  const [hasTriedFallbackTranscode, setHasTriedFallbackTranscode] = useState(false);
  const [playbackDuration, setPlaybackDuration] = useState<number>(0);

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

  // If item is a series and no activeEpisode is resolved yet, fetch series seasons/episodes
  useEffect(() => {
    if (item.type === 'Series' && !activeEpisode) {
      if (item.seasons && item.seasons.length > 0) {
        const allEps = item.seasons.flatMap((s) => s.episodes || []);
        const found = activePlayableId
          ? allEps.find((ep) => ep.jellyfinId === activePlayableId || ep.id === activePlayableId)
          : allEps.find((ep) => ep.videoStreamUrl || ep.jellyfinId);
        if (found) {
          setActiveEpisode(found);
          if (!activePlayableId) setActivePlayableId(found.jellyfinId || found.id);
          return;
        }
      }

      setIsLoadingEpisode(true);
      fetch(`/api/media/${item.id}`)
        .then((res) => res.json())
        .then((data) => {
          const media = data.item;
          if (!media) return;
          const targetPlayableId = activePlayableId || media.playableEpisodeId;
          if (targetPlayableId && !activePlayableId) {
            setActivePlayableId(targetPlayableId);
          }
          if (media.seasons) {
            const allEps = media.seasons.flatMap((s: any) => s.episodes || []);
            const found = targetPlayableId
              ? allEps.find((ep: any) => ep.jellyfinId === targetPlayableId || ep.id === targetPlayableId)
              : allEps.find((ep: any) => ep.videoStreamUrl || ep.jellyfinId);
            if (found) {
              setActiveEpisode(found);
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingEpisode(false));
    }
  }, [item, activeEpisode, activePlayableId]);

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

  // Resolve known media duration in seconds
  const knownDurationSeconds =
    playbackDuration ||
    (activeEpisode?.totalDurationTicks ? activeEpisode.totalDurationTicks / 10000000 : undefined) ||
    (activeEpisode?.durationMinutes ? activeEpisode.durationMinutes * 60 : undefined) ||
    (item.totalDurationTicks ? item.totalDurationTicks / 10000000 : undefined) ||
    (item.durationMinutes ? item.durationMinutes * 60 : undefined) ||
    0;

  useEffect(() => {
    if (knownDurationSeconds > 0) {
      setDuration((prev) => {
        if (!prev || prev <= 10 || Math.abs(prev - knownDurationSeconds) > 60) {
          return knownDurationSeconds;
        }
        return prev;
      });
    }
  }, [knownDurationSeconds]);

  // Negotiate dynamic playback stream (DirectPlay / Transcoding)
  useEffect(() => {
    if (!activePlayableId && item.type === 'Series') {
      return;
    }

    if (!isJellyfinItem) {
      setStreamUrl(activeEpisode?.videoStreamUrl || item.videoStreamUrl || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4');
      setIsLoadingStream(false);
      return;
    }

    const targetId = activePlayableId || item.playableEpisodeId || (item.type !== 'Series' ? item.jellyfinId || item.id : undefined);
    if (!targetId) return;

    setIsLoadingStream(true);
    setStreamError(false);
    setHasTriedFallbackTranscode(false);

    // Detect browser HEVC capability
    const canPlayHevc = typeof document !== 'undefined' && (
      document.createElement('video').canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') === 'probably' ||
      document.createElement('video').canPlayType('video/mp4; codecs="hev1.1.6.L93.B0"') === 'probably'
    );

    let isMounted = true;
    fetch(`/api/playback?itemId=${targetId}&canPlayHevc=${canPlayHevc}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.streamUrl) {
          setStreamUrl(data.streamUrl);
          setIsTranscoding(Boolean(data.isTranscoding));
          if (data.durationSeconds && data.durationSeconds > 0) {
            setPlaybackDuration(data.durationSeconds);
            setDuration(data.durationSeconds);
          }
        } else {
          const cleanUrl = jellyfinServerUrl?.replace(/\/+$/, '') || '';
          setStreamUrl(`${cleanUrl}/Videos/${targetId}/stream.mp4?api_key=${jellyfinApiKey}`);
        }
      })
      .catch((err) => {
        console.error('Failed to negotiate playback stream:', err);
        if (!isMounted) return;
        const cleanUrl = jellyfinServerUrl?.replace(/\/+$/, '') || '';
        setStreamUrl(`${cleanUrl}/Videos/${targetId}/stream.mp4?api_key=${jellyfinApiKey}`);
      })
      .finally(() => {
        if (isMounted) setIsLoadingStream(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activePlayableId, item, isJellyfinItem, jellyfinServerUrl, jellyfinApiKey, activeEpisode]);

  const handlePlaybackError = useCallback(() => {
    const targetId = activePlayableId || item.playableEpisodeId || (item.type !== 'Series' ? item.jellyfinId || item.id : undefined);

    if (isJellyfinItem && targetId && !hasTriedFallbackTranscode) {
      console.warn('Playback error encountered on direct stream. Attempting automatic Jellyfin transcoding fallback...');
      setHasTriedFallbackTranscode(true);
      setIsLoadingStream(true);

      fetch(`/api/playback?itemId=${targetId}&forceTranscode=true`)
        .then((res) => res.json())
        .then((data) => {
          if (data.streamUrl) {
            setStreamUrl(data.streamUrl);
            setIsTranscoding(true);
            setStreamError(false);
            if (data.durationSeconds && data.durationSeconds > 0) {
              setPlaybackDuration(data.durationSeconds);
              setDuration(data.durationSeconds);
            }
            if (videoRef.current) {
              videoRef.current.load();
              videoRef.current.play().catch(console.error);
            }
          } else {
            setStreamError(true);
            setIsPlaying(false);
          }
        })
        .catch((err) => {
          console.error('Failed fallback transcoding:', err);
          setStreamError(true);
          setIsPlaying(false);
        })
        .finally(() => {
          setIsLoadingStream(false);
        });
      return;
    }

    setStreamError(true);
    setIsPlaying(false);
  }, [activePlayableId, item, isJellyfinItem, hasTriedFallbackTranscode]);

  const handleRetryPlayback = () => {
    const targetId = activePlayableId || item.playableEpisodeId || (item.type !== 'Series' ? item.jellyfinId || item.id : undefined);
    setStreamError(false);
    setIsLoadingStream(true);

    if (isJellyfinItem && targetId) {
      fetch(`/api/playback?itemId=${targetId}&forceTranscode=true`)
        .then((res) => res.json())
        .then((data) => {
          if (data.streamUrl) {
            setStreamUrl(data.streamUrl);
            setIsTranscoding(true);
            if (data.durationSeconds && data.durationSeconds > 0) {
              setPlaybackDuration(data.durationSeconds);
              setDuration(data.durationSeconds);
            }
            if (videoRef.current) {
              videoRef.current.load();
              videoRef.current.play().catch(console.error);
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingStream(false));
    } else {
      if (videoRef.current) {
        videoRef.current.load();
        videoRef.current.play().catch(console.error);
      }
      setIsLoadingStream(false);
    }
  };

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
      const effectiveDuration = duration > 0 ? duration : (knownDurationSeconds > 0 ? knownDurationSeconds : (videoRef.current.duration || 0));
      if (videoRef.current.buffered.length > 0 && effectiveDuration > 0) {
        const buffEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
        setBuffered(Math.min(100, (buffEnd / effectiveDuration) * 100));
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDur = videoRef.current.duration;
      // Jellyfin transcode chunks (e.g. 5s) report a tiny segment duration.
      // Never overwrite duration with a small segment duration (< 60s) when the title has a known longer duration.
      if (Number.isFinite(videoDur) && videoDur > 60 && (!knownDurationSeconds || videoDur >= knownDurationSeconds * 0.7)) {
        setDuration(videoDur);
      } else if (knownDurationSeconds > 0) {
        setDuration(knownDurationSeconds);
      } else if (Number.isFinite(videoDur) && videoDur > 0) {
        setDuration(videoDur);
      }

      // Auto-resume from previous playback position
      let resumeSeconds = 0;
      if (activeEpisode?.playbackPositionTicks && activeEpisode.playbackPositionTicks > 0) {
        resumeSeconds = Math.floor(activeEpisode.playbackPositionTicks / 10000000);
      } else if (item.playbackPositionTicks && item.playbackPositionTicks > 0) {
        resumeSeconds = Math.floor(item.playbackPositionTicks / 10000000);
      }

      const effectiveDuration = knownDurationSeconds > 0 ? knownDurationSeconds : (videoRef.current.duration || 0);
      if (resumeSeconds > 0 && effectiveDuration > 0 && resumeSeconds < effectiveDuration - 5) {
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
      {/* Loading Indicator */}
      {(isLoadingEpisode || isLoadingStream) && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-40 space-y-3">
          <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium text-gray-400">
            {isLoadingEpisode
              ? 'Loading series episode...'
              : isTranscoding
              ? 'Preparing hardware-accelerated stream...'
              : 'Loading media stream...'}
          </span>
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
              onClick={handleRetryPlayback}
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
          onError={handlePlaybackError}
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
        <div className="p-3 sm:p-6 md:p-8 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto">
          {/* Back button + Media Title */}
          <div className="flex items-center space-x-2.5 sm:space-x-4 min-w-0 flex-1 mr-4">
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors shrink-0"
              title="Back (Esc)"
            >
              <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
            <div className="space-y-0.5 min-w-0 flex-1">
              <h2 className="text-white font-bold text-base sm:text-lg md:text-xl drop-shadow truncate">
                {item.title}
              </h2>
              {activeEpisode && (
                <p className="text-neutral-400 text-xs sm:text-sm font-medium truncate">
                  Season {activeEpisode.seasonNumber}, Episode {activeEpisode.episodeNumber}: {activeEpisode.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center Floating Play/Pause for Mobile & Quick Touch */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <button
            onClick={togglePlay}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center pointer-events-auto hover:scale-110 active:scale-90 transition-all shadow-2xl backdrop-blur-sm"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-white" />
            ) : (
              <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white ml-1" />
            )}
          </button>
        </div>

        {/* Bottom Controls Bar */}
        <div
          className="p-3 sm:p-6 md:p-8 pb-4 sm:pb-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-auto space-y-2 sm:space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Timeline Scrubber */}
          <div className="relative group/scrubber cursor-pointer w-full flex items-center py-1.5 sm:py-2">
            {/* Buffer Bar */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-neutral-700 rounded-full pointer-events-none"
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
          <div className="flex items-center justify-between text-white pt-0.5 sm:pt-1">
            {/* Left: Play/Pause, Rewind, Forward, Volume, Time */}
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-6 min-w-0">
              <button
                onClick={togglePlay}
                className="hover:text-red-500 transition-colors p-1"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 sm:w-6 sm:h-6" /> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white" />}
              </button>

              <button
                onClick={() => seek(-10)}
                className="hover:text-neutral-300 transition-colors p-1"
                title="Rewind 10 seconds"
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                onClick={() => seek(10)}
                className="hover:text-neutral-300 transition-colors p-1"
                title="Fast forward 10 seconds"
              >
                <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Volume control: mute toggle everywhere; range slider on desktop/tablet hover */}
              <div
                className="flex items-center space-x-1 sm:space-x-2 group/volume relative py-1"
                onMouseEnter={() => setIsVolumeHovered(true)}
                onMouseLeave={() => setIsVolumeHovered(false)}
              >
                <button onClick={toggleMute} className="hover:text-neutral-300 transition-colors p-1" title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <div
                  className={`hidden sm:flex overflow-hidden items-center transition-all duration-300 ${
                    isVolumeHovered || isVolumeInteracting
                      ? 'w-20 opacity-100 pointer-events-auto'
                      : 'w-0 opacity-0 pointer-events-none'
                  }`}
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    onMouseDown={() => setIsVolumeInteracting(true)}
                    onMouseUp={() => setIsVolumeInteracting(false)}
                    onTouchStart={() => setIsVolumeInteracting(true)}
                    onTouchEnd={() => setIsVolumeInteracting(false)}
                    className="w-20 h-1 bg-neutral-600 rounded appearance-none cursor-pointer accent-white"
                  />
                </div>
              </div>

              {/* Time Display */}
              <div className="text-[11px] sm:text-xs md:text-sm font-mono text-neutral-300 whitespace-nowrap">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1 text-neutral-500">/</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Center: Title on Tablet/Desktop */}
            <div className="hidden xl:block text-sm font-semibold text-neutral-300 truncate max-w-sm px-4">
              {currentTitle}
            </div>

            {/* Right: Subtitles, Next Episode, Fullscreen */}
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-5 relative shrink-0">
              {/* Subtitles Button & Popover */}
              <div className="relative">
                <button
                  onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                  className={`transition-colors p-1 rounded hover:text-white ${
                    selectedSubtitleId ? 'text-red-500' : 'text-neutral-300 hover:text-white'
                  }`}
                  title="Subtitles (C)"
                >
                  <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {/* Subtitles Selection Popup Menu */}
                {showSubtitleMenu && (
                  <div
                    className="absolute right-0 bottom-10 sm:bottom-12 bg-neutral-900/95 border border-neutral-700/80 rounded-lg shadow-2xl p-3 min-w-[200px] sm:min-w-[240px] max-h-[50vh] sm:max-h-[300px] overflow-y-auto z-50 animate-fade-in backdrop-blur-md"
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
                  className="flex items-center space-x-1 hover:text-neutral-300 transition-colors text-xs sm:text-sm font-semibold p-1"
                  title="Next Episode"
                >
                  <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden md:inline">Next Episode</span>
                </button>
              )}

              <button
                onClick={toggleFullscreen}
                className="hover:text-neutral-300 transition-colors p-1"
                title="Fullscreen (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
