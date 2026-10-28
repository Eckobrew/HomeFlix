'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Plus, Check, ThumbsUp, ChevronDown, Download, Clock, Volume2, VolumeX } from 'lucide-react';
import { MediaItem } from '@/types';

interface MediaCardProps {
  item: MediaItem;
  onPlay: (item: MediaItem) => void;
  onOpenModal: (item: MediaItem) => void;
  onRequest?: (item: MediaItem) => void;
  rankNumber?: number; // For Top 10 rows!
  isFirst?: boolean;
  isLast?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onPlay,
  onOpenModal,
  onRequest,
  rankNumber,
  isFirst = false,
  isLast = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isPreviewMuted, setIsPreviewMuted] = useState(true);
  const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>(
    isFirst ? 'left' : isLast ? 'right' : 'center'
  );

  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewStartTimeRef = useRef<number>(0);

  const isAvailable = item.status === 'available' || item.source === 'jellyfin' || item.source === 'demo';
  const isRequested = item.status === 'requested' || item.status === 'processing';

  // Smooth hover intent delay & preview trigger
  const handleMouseEnter = () => {
    // Dynamically calculate whether the card is at the edge of the visible scroll track
    if (cardRef.current) {
      const cardRect = cardRef.current.getBoundingClientRect();
      const parentScroll = cardRef.current.closest('.overflow-x-auto');
      if (parentScroll) {
        const parentRect = parentScroll.getBoundingClientRect();
        if (cardRect.left - parentRect.left < 60) {
          setAlignment('left');
        } else if (parentRect.right - cardRect.right < 60) {
          setAlignment('right');
        } else {
          setAlignment('center');
        }
      } else {
        if (cardRect.left < 80) {
          setAlignment('left');
        } else if (window.innerWidth - cardRect.right < 80) {
          setAlignment('right');
        } else {
          setAlignment('center');
        }
      }
    }

    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);

      // Start muted video preview after expanding
      if (item.videoStreamUrl) {
        previewTimeoutRef.current = setTimeout(() => {
          setIsPlayingPreview(true);
        }, 400);
      }
    }, 280);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    setIsHovered(false);
    setIsPlayingPreview(false);
    previewStartTimeRef.current = 0;
  };

  // When preview video metadata loads:
  // For Continue Watching / in-progress items, start preview EXACTLY where the user left off!
  // Otherwise, pick a dynamic RANDOM section between 15% and 75% of runtime.
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    let seekTime = 45; // default 45s in

    if (item.playbackPositionTicks && item.playbackPositionTicks > 0) {
      const resumeSecs = Math.floor(item.playbackPositionTicks / 10000000);
      if (dur && isFinite(dur)) {
        seekTime = Math.min(resumeSecs, Math.max(0, dur - 5));
      } else {
        seekTime = resumeSecs;
      }
    } else if (item.progressPercent && item.progressPercent > 0 && dur && isFinite(dur)) {
      seekTime = Math.floor((dur * item.progressPercent) / 100);
    } else if (dur && isFinite(dur) && dur > 60) {
      // Pick random timestamp between 15% and 75% into the show/movie
      const minStart = dur * 0.15;
      const maxStart = dur * 0.75;
      seekTime = Math.floor(minStart + Math.random() * (maxStart - minStart));
    } else if (dur && dur > 20) {
      seekTime = Math.floor(dur * 0.25);
    }

    previewStartTimeRef.current = seekTime;
    videoRef.current.currentTime = seekTime;
    videoRef.current.play().catch(() => {});
  };

  // Loop back after ~20 seconds so the teaser stays dynamic
  const handleTimeUpdate = () => {
    if (!videoRef.current || previewStartTimeRef.current <= 0) return;
    if (videoRef.current.currentTime > previewStartTimeRef.current + 20) {
      videoRef.current.currentTime = previewStartTimeRef.current;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      className="relative shrink-0 select-none group cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Top 10 Layout: Large stylized rank number on left + poster */}
      {rankNumber ? (
        <div className="flex items-center">
          {/* Big Stylized Rank Number */}
          <div className="text-7xl md:text-8xl font-black text-stroke-white text-transparent select-none tracking-tighter opacity-80 -mr-4 md:-mr-6 z-10 font-sans scale-y-110 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)]">
            <span className="text-stroke-gray">{rankNumber}</span>
          </div>

          {/* Poster */}
          <div
            onClick={() => onOpenModal(item)}
            className="w-32 sm:w-36 md:w-44 aspect-[2/3] rounded overflow-hidden relative shadow-lg group-hover:scale-105 transition-transform duration-300 bg-neutral-900"
          >
            <img
              src={item.posterUrl || item.backdropUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      ) : (
        /* Standard 16:9 Backdrop Card */
        <div
          onClick={() => onOpenModal(item)}
          className="w-48 sm:w-56 md:w-64 aspect-video rounded overflow-hidden relative shadow-md bg-neutral-900 group-hover:scale-105 transition-transform duration-300"
        >
          <img
            src={item.backdropUrl || item.posterUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />

          {/* Continue Watching Progress Bar */}
          {typeof item.progressPercent === 'number' && item.progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
              <div
                className="h-full bg-red-600"
                style={{ width: `${item.progressPercent}%` }}
              />
            </div>
          )}

          {/* Status badge in top right corner if from Seerr */}
          {item.source === 'seerr' && (
            <div className="absolute top-2 right-2 z-10">
              {isAvailable ? (
                <span className="bg-emerald-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm">
                  ON JELLYFIN
                </span>
              ) : isRequested ? (
                <span className="bg-amber-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm flex items-center space-x-1">
                  <Clock size={10} />
                  <span>REQUESTED</span>
                </span>
              ) : (
                <span className="bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow backdrop-blur-sm flex items-center space-x-1">
                  <Download size={10} />
                  <span>REQUEST</span>
                </span>
              )}
            </div>
          )}

          {/* Title overlay on bottom of card */}
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end">
            <h4 className="text-white text-xs sm:text-sm font-semibold truncate drop-shadow">
              {item.title}
            </h4>
          </div>
        </div>
      )}

      {/* Floating Hover Card with Random Section Video Preview */}
      {isHovered && !rankNumber && (
        <div
          className={`hidden md:block absolute -top-24 md:-top-28 z-50 w-72 md:w-80 bg-[#181818] rounded-md shadow-[0_22px_50px_rgba(0,0,0,0.98)] overflow-hidden border border-neutral-700/80 animate-fade-in pointer-events-auto ${
            alignment === 'left'
              ? 'left-0 origin-left'
              : alignment === 'right'
              ? 'right-0 origin-right'
              : '-left-6 md:-left-8 origin-center'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Card Media Header with Live Video Preview */}
          <div
            onClick={() => onOpenModal(item)}
            className="relative aspect-video w-full bg-neutral-900 cursor-pointer overflow-hidden group/preview"
          >
            {/* Poster / Backdrop Image */}
            <img
              src={item.backdropUrl || item.posterUrl}
              alt={item.title}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                isPlayingPreview && item.videoStreamUrl ? 'opacity-0' : 'opacity-100'
              }`}
            />

            {/* Video Preview Streaming Random Section */}
            {isPlayingPreview && item.videoStreamUrl && (
              <video
                ref={videoRef}
                src={item.videoStreamUrl}
                autoPlay
                muted={isPreviewMuted}
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                onError={() => setIsPlayingPreview(false)}
                className="absolute inset-0 w-full h-full object-cover animate-fade-in"
              />
            )}

            {/* Preview Audio Mute/Unmute Button */}
            {isPlayingPreview && item.videoStreamUrl && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextMute = !isPreviewMuted;
                  setIsPreviewMuted(nextMute);
                  if (videoRef.current) {
                    videoRef.current.muted = nextMute;
                  }
                }}
                className="absolute bottom-2 right-2 z-20 p-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white backdrop-blur-sm transition-colors border border-white/30"
                title={isPreviewMuted ? 'Unmute video preview' : 'Mute video preview'}
              >
                {isPreviewMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
            )}

            {/* Continue Watching Progress Bar */}
            {typeof item.progressPercent === 'number' && item.progressPercent > 0 && !isPlayingPreview && (
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-700">
                <div
                  className="h-full bg-red-600"
                  style={{ width: `${item.progressPercent}%` }}
                />
              </div>
            )}
          </div>

          {/* Card Hover Details */}
          <div className="p-3 space-y-2 bg-[#181818]">
            {/* Quick Action Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {isAvailable ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPlay(item);
                    }}
                    className="w-8 h-8 rounded-full bg-white hover:bg-neutral-200 text-black flex items-center justify-center transition-transform hover:scale-105 shadow"
                    title="Play"
                  >
                    <Play size={16} className="fill-black ml-0.5" />
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onRequest) {
                        onRequest(item);
                      } else {
                        onOpenModal(item);
                      }
                    }}
                    disabled={isRequested}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105 shadow ${
                      isRequested
                        ? 'bg-amber-600 cursor-not-allowed opacity-80'
                        : 'bg-red-600 hover:bg-red-500'
                    }`}
                    title={isRequested ? 'Requested' : 'Request to Download via Seerr'}
                  >
                    {isRequested ? <Clock size={15} /> : <Download size={15} />}
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFavorite(!isFavorite);
                  }}
                  className="w-8 h-8 rounded-full border border-gray-400 hover:border-white text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                  title="Add to My List"
                >
                  {isFavorite ? <Check size={16} /> : <Plus size={16} />}
                </button>

                <button
                  onClick={(e) => e.stopPropagation()}
                  className="w-8 h-8 rounded-full border border-gray-400 hover:border-white text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                  title="Like"
                >
                  <ThumbsUp size={14} />
                </button>
              </div>

              {/* Chevron to open full modal */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenModal(item);
                }}
                className="w-8 h-8 rounded-full border border-gray-400 hover:border-white text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                title="Episode & Details Info"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            {/* Title */}
            <div className="font-bold text-white text-sm truncate">
              {item.title}
            </div>

            {/* Badges & Meta */}
            <div className="flex items-center space-x-2 text-xs font-semibold">
              <span className="text-emerald-400">{item.matchPercentage || 97}% Match</span>
              <span className="border border-gray-400/50 px-1 py-0.2 rounded text-[10px] text-gray-300">
                {item.rating || 'TV-MA'}
              </span>
              <span className="text-gray-400 text-[11px]">
                {item.seasonsCount
                  ? `${item.seasonsCount} Season${item.seasonsCount > 1 ? 's' : ''}`
                  : item.durationMinutes
                  ? `${item.durationMinutes}m`
                  : item.year || ''}
              </span>
              <span className="border border-gray-400/40 text-[9px] px-1 rounded font-mono text-gray-400">
                HD
              </span>
            </div>

            {/* Genres */}
            {item.genres && item.genres.length > 0 && (
              <div className="flex items-center space-x-1.5 text-[11px] text-gray-300 truncate">
                {item.genres.slice(0, 3).map((g, idx) => (
                  <span key={g} className="flex items-center">
                    {g}
                    {idx < Math.min(item.genres.length, 3) - 1 && (
                      <span className="mx-1 text-neutral-500">•</span>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
