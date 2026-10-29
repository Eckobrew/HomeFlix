'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, RotateCcw, Info, Volume2, VolumeX, Plus, Check, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { MediaItem } from '@/types';

interface HeroBannerProps {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onOpenModal: (item: MediaItem) => void;
  onRequest?: (item: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  items,
  onPlay,
  onOpenModal,
  onRequest,
}) => {
  // Randomly pick initial index on load
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [inMyList, setInMyList] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const heroStartTimeRef = useRef<number>(0);

  // Set random starting index on initial mount
  useEffect(() => {
    if (items && items.length > 0) {
      const randomIdx = Math.floor(Math.random() * items.length);
      setCurrentIndex(randomIdx);
    }
  }, [items.length]);

  const currentItem = items[currentIndex] || items[0];
  const hasResume = Boolean(
    (currentItem?.playbackPositionTicks && currentItem.playbackPositionTicks > 0) ||
    (currentItem?.progressPercent && currentItem.progressPercent > 0)
  );

  // Auto-cycle through items every 9 seconds
  useEffect(() => {
    if (!items || items.length <= 1 || isHovering) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, 9000);

    return () => clearInterval(interval);
  }, [items, isHovering]);

  // Video preview timer for current item
  useEffect(() => {
    setShowVideo(false);
    heroStartTimeRef.current = 0;
    if (!currentItem?.videoStreamUrl) return;

    const timer = setTimeout(() => {
      setShowVideo(true);
    }, 1800);

    return () => clearTimeout(timer);
  }, [currentItem]);

  // If item has a resume playback position, start preview where the user left off!
  // Otherwise jump to random section between 15% and 75% of runtime.
  const handleHeroLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    let seekTime = 60;

    if (currentItem.playbackPositionTicks && currentItem.playbackPositionTicks > 0) {
      const resumeSecs = Math.floor(currentItem.playbackPositionTicks / 10000000);
      if (dur && isFinite(dur)) {
        seekTime = Math.min(resumeSecs, Math.max(0, dur - 5));
      } else {
        seekTime = resumeSecs;
      }
    } else if (currentItem.progressPercent && currentItem.progressPercent > 0 && dur && isFinite(dur)) {
      seekTime = Math.floor((dur * currentItem.progressPercent) / 100);
    } else if (dur && isFinite(dur) && dur > 60) {
      const startMin = dur * 0.15;
      const startMax = dur * 0.75;
      seekTime = Math.floor(startMin + Math.random() * (startMax - startMin));
    } else if (dur && dur > 20) {
      seekTime = Math.floor(dur * 0.25);
    }
    heroStartTimeRef.current = seekTime;
    videoRef.current.currentTime = seekTime;
    videoRef.current.play().catch(() => {});
  };

  const handleHeroTimeUpdate = () => {
    if (!videoRef.current || heroStartTimeRef.current <= 0) return;
    if (videoRef.current.currentTime > heroStartTimeRef.current + 30) {
      videoRef.current.currentTime = heroStartTimeRef.current;
    }
  };

  const nextHero = useCallback(() => {
    if (!items || items.length === 0) return;
    setCurrentIndex((prev) => (prev + 1) % items.length);
  }, [items]);

  const prevHero = useCallback(() => {
    if (!items || items.length === 0) return;
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);
  }, [items]);

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (videoRef.current) {
      videoRef.current.muted = nextMute;
    }
  };

  if (!currentItem) return null;

  return (
    <div
      className="relative w-full h-[70vh] md:h-[85vh] lg:h-[90vh] select-none overflow-hidden group/hero"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Background image with crossfade */}
      <div
        key={`bg-${currentItem.id}`}
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 animate-fade-in"
        style={{
          backgroundImage: `url(${currentItem.backdropUrl || currentItem.posterUrl})`,
        }}
      />

      {/* Hero Video Preview */}
      {showVideo && currentItem.videoStreamUrl && (
        <video
          key={`vid-${currentItem.id}`}
          ref={videoRef}
          src={currentItem.videoStreamUrl}
          autoPlay
          muted={isMuted}
          playsInline
          onLoadedMetadata={handleHeroLoadedMetadata}
          onTimeUpdate={handleHeroTimeUpdate}
          onError={() => setShowVideo(false)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
        />
      )}

      {/* Cinematic Gradients: bottom fade, left side fade, top subtle shadow */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/40 to-black/60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/75 to-transparent w-full md:w-3/4 pointer-events-none" />

      {/* Manual Hero Navigation Arrows (hover) */}
      {items.length > 1 && (
        <>
          <button
            onClick={prevHero}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white opacity-0 group-hover/hero:opacity-100 transition-opacity backdrop-blur-sm"
            title="Previous Featured Title"
          >
            <ChevronLeft size={36} />
          </button>
          <button
            onClick={nextHero}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white/70 hover:text-white opacity-0 group-hover/hero:opacity-100 transition-opacity backdrop-blur-sm"
            title="Next Featured Title"
          >
            <ChevronRight size={36} />
          </button>
        </>
      )}

      {/* Content Container */}
      <div className="relative z-30 h-full flex flex-col justify-end px-4 md:px-12 pb-24 md:pb-32 max-w-3xl space-y-3 md:space-y-4 pointer-events-none">
        {/* Type / Series Badge */}
        <div className="flex items-center space-x-2 text-xs font-bold tracking-widest text-red-500 uppercase pointer-events-auto">
          <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px] tracking-normal font-black">
            HF
          </span>
          <span>{currentItem.type === 'Series' ? 'SERIES' : 'FILM'}</span>
          {currentItem.source === 'jellyfin' && (
            <span className="text-emerald-400 font-semibold">• Ready to stream on Jellyfin</span>
          )}
        </div>

        {/* Title */}
        <h1
          key={`title-${currentItem.id}`}
          className="text-3xl sm:text-5xl md:text-6xl font-black text-white drop-shadow-md tracking-tight leading-tight animate-fade-in pointer-events-auto"
        >
          {currentItem.title}
        </h1>

        {/* Metadata Row */}
        <div className="flex items-center space-x-3 text-sm font-semibold text-gray-200 pointer-events-auto">
          <span className="text-emerald-400">{currentItem.matchPercentage || 98}% Match</span>
          {currentItem.year && <span>{currentItem.year}</span>}
          <span className="border border-gray-400/60 px-1 py-0.2 text-xs rounded text-gray-300 font-normal">
            {currentItem.rating || 'TV-MA'}
          </span>
          {typeof currentItem.seasonsCount === 'number' && currentItem.seasonsCount > 0 && (
            <span>{currentItem.seasonsCount} Season{currentItem.seasonsCount > 1 ? 's' : ''}</span>
          )}
          {typeof currentItem.durationMinutes === 'number' && currentItem.durationMinutes > 0 && (
            <span>{Math.floor(currentItem.durationMinutes / 60)}h {currentItem.durationMinutes % 60}m</span>
          )}
          {/* Dynamic Resolution & HDR Badges */}
          {currentItem.resolution ? (
            <span className="border border-gray-400/40 text-[10px] px-1 py-0.5 rounded font-mono text-gray-300">
              {currentItem.resolution}
            </span>
          ) : currentItem.source !== 'seerr' ? (
            <span className="border border-gray-400/40 text-[10px] px-1 py-0.5 rounded font-mono text-gray-400">
              HD
            </span>
          ) : null}
          {currentItem.hasHdr && (
            <span className="border border-amber-500/70 text-[10px] px-1.5 py-0.5 rounded font-mono text-amber-400 font-bold bg-amber-950/30">
              HDR
            </span>
          )}
          {currentItem.audioQuality && (
            <span className="border border-gray-400/40 text-[10px] px-1 py-0.5 rounded font-mono text-gray-300">
              {currentItem.audioQuality}
            </span>
          )}
        </div>

        {/* Overview */}
        <p
          key={`overview-${currentItem.id}`}
          className="text-sm md:text-base text-gray-200 line-clamp-3 md:line-clamp-4 leading-relaxed drop-shadow max-w-xl animate-fade-in pointer-events-auto"
        >
          {currentItem.overview}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 pt-2 pointer-events-auto">
          {/* If item is requestable (e.g. from Seerr on requests tab) */}
          {currentItem.status !== 'available' ? (
            <button
              onClick={() => onRequest && onRequest(currentItem)}
              className="flex items-center space-x-1.5 sm:space-x-2 bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 sm:px-6 sm:py-2.5 rounded transition-transform active:scale-95 shadow-md text-sm sm:text-base"
            >
              <Download size={18} className="sm:w-5 sm:h-5" />
              <span>
                {currentItem.status === 'requested' || currentItem.status === 'processing'
                  ? 'Requested'
                  : 'Request Download'}
              </span>
            </button>
          ) : (
            <button
              onClick={() => onPlay(currentItem)}
              className="flex items-center space-x-1.5 sm:space-x-2 bg-white text-black hover:bg-neutral-200 font-bold px-4 py-2 sm:px-6 sm:py-2.5 rounded transition-transform active:scale-95 shadow-md text-sm sm:text-base"
            >
              <Play size={18} className="fill-black sm:w-5 sm:h-5" />
              <span>{hasResume ? 'Resume' : 'Play'}</span>
            </button>
          )}

          {/* Restart Button when item has saved progress */}
          {hasResume && (
            <button
              onClick={() => {
                const restartItem = { ...currentItem, playbackPositionTicks: 0, progressPercent: 0 };
                const targetId = restartItem.playableEpisodeId || (restartItem.type !== 'Series' ? restartItem.jellyfinId || restartItem.id : undefined);
                if (targetId) {
                  fetch('/api/playback/progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ itemId: targetId, positionTicks: 0, isPaused: false }),
                  }).catch(() => {});
                }
                onPlay(restartItem);
              }}
              className="flex items-center space-x-1.5 sm:space-x-2 bg-neutral-800/90 hover:bg-neutral-700 text-white font-semibold px-3 sm:px-4 py-2 sm:py-2.5 rounded transition-colors backdrop-blur-sm text-sm sm:text-base border border-neutral-700 shadow-md"
              title="Restart from beginning"
            >
              <RotateCcw size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span>Restart</span>
            </button>
          )}

          {/* More Info Button */}
          <button
            onClick={() => onOpenModal(currentItem)}
            className="flex items-center space-x-1.5 sm:space-x-2 bg-neutral-600/70 hover:bg-neutral-600/90 text-white font-semibold px-3.5 py-2 sm:px-5 sm:py-2.5 rounded transition-colors backdrop-blur-sm text-sm sm:text-base"
          >
            <Info size={18} className="sm:w-5 sm:h-5" />
            <span>More Info</span>
          </button>

          {/* Add to list button */}
          <button
            onClick={() => setInMyList(!inMyList)}
            className="p-2 sm:p-2.5 rounded-full border-2 border-gray-400 hover:border-white text-white hover:bg-white/10 transition-colors"
            title={inMyList ? 'Remove from My List' : 'Add to My List'}
          >
            {inMyList ? <Check size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
        </div>
      </div>

      {/* Right side floating controls & Carousel Indicators: upper right on mobile to prevent button overlap */}
      <div className="absolute right-4 md:right-12 top-20 sm:top-auto sm:bottom-24 md:bottom-32 z-30 flex flex-col items-end space-y-3 pointer-events-auto">
        {/* Sound toggle & age rating */}
        <div className="flex items-center space-x-3">
          {showVideo && currentItem.videoStreamUrl && (
            <button
              onClick={toggleMute}
              className="p-2.5 rounded-full border border-white/40 bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition-colors"
              title={isMuted ? 'Unmute preview' : 'Mute preview'}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
          <div className="bg-neutral-800/80 border-l-4 border-red-600 px-3 py-1 text-xs font-semibold text-gray-200">
            {currentItem.rating || 'TV-MA'}
          </div>
        </div>

        {/* 5 Carousel Indicators */}
        {items.length > 1 && (
          <div className="flex items-center space-x-1.5 pt-1">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={`h-1 rounded-full transition-all duration-300 ${
                  currentIndex === idx ? 'w-6 bg-red-600' : 'w-2 bg-neutral-600 hover:bg-neutral-400'
                }`}
                title={`Featured Title ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
