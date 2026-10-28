'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Info, Volume2, VolumeX, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '@/types';

interface HeroBannerProps {
  items: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onOpenModal: (item: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  items,
  onPlay,
  onOpenModal,
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

  // Auto-cycle through items every 9 seconds (like Netflix)
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

  // Jump to random section between 15% and 75% of runtime
  const handleHeroLoadedMetadata = () => {
    if (!videoRef.current) return;
    const dur = videoRef.current.duration;
    let seekTime = 60;
    if (dur && isFinite(dur) && dur > 60) {
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
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 animate-fade-in"
        />
      )}

      {/* Netflix Gradients: bottom fade, left side fade, top subtle shadow */}
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
      <div className="relative z-10 h-full flex flex-col justify-end px-4 md:px-12 pb-24 md:pb-32 max-w-3xl space-y-3 md:space-y-4">
        {/* Type / Series Badge */}
        <div className="flex items-center space-x-2 text-xs font-bold tracking-widest text-red-500 uppercase">
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
          className="text-3xl sm:text-5xl md:text-6xl font-black text-white drop-shadow-md tracking-tight leading-tight animate-fade-in"
        >
          {currentItem.title}
        </h1>

        {/* Metadata Row */}
        <div className="flex items-center space-x-3 text-sm font-semibold text-gray-200">
          <span className="text-emerald-400">{currentItem.matchPercentage || 98}% Match</span>
          {currentItem.year && <span>{currentItem.year}</span>}
          <span className="border border-gray-400/60 px-1 py-0.2 text-xs rounded text-gray-300 font-normal">
            {currentItem.rating || 'TV-MA'}
          </span>
          {currentItem.seasonsCount && <span>{currentItem.seasonsCount} Season{currentItem.seasonsCount > 1 ? 's' : ''}</span>}
          {currentItem.durationMinutes && <span>{Math.floor(currentItem.durationMinutes / 60)}h {currentItem.durationMinutes % 60}m</span>}
          <span className="border border-gray-400/40 text-[10px] px-1 py-0.5 rounded font-mono text-gray-400">
            4K UHD
          </span>
        </div>

        {/* Overview */}
        <p
          key={`overview-${currentItem.id}`}
          className="text-sm md:text-base text-gray-200 line-clamp-3 md:line-clamp-4 leading-relaxed drop-shadow max-w-xl animate-fade-in"
        >
          {currentItem.overview}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3 pt-2">
          {/* Play Button */}
          <button
            onClick={() => onPlay(currentItem)}
            className="flex items-center space-x-2 bg-white text-black hover:bg-neutral-200 font-bold px-6 py-2.5 rounded transition-transform active:scale-95 shadow-md text-base"
          >
            <Play size={20} className="fill-black" />
            <span>Play</span>
          </button>

          {/* More Info Button */}
          <button
            onClick={() => onOpenModal(currentItem)}
            className="flex items-center space-x-2 bg-neutral-600/70 hover:bg-neutral-600/90 text-white font-semibold px-5 py-2.5 rounded transition-colors backdrop-blur-sm text-base"
          >
            <Info size={20} />
            <span>More Info</span>
          </button>

          {/* Add to list button */}
          <button
            onClick={() => setInMyList(!inMyList)}
            className="p-2.5 rounded-full border-2 border-gray-400 hover:border-white text-white hover:bg-white/10 transition-colors"
            title={inMyList ? 'Remove from My List' : 'Add to My List'}
          >
            {inMyList ? <Check size={18} /> : <Plus size={18} />}
          </button>
        </div>
      </div>

      {/* Right side floating controls & Netflix Carousel Indicators */}
      <div className="absolute right-4 md:right-12 bottom-24 md:bottom-32 z-10 flex flex-col items-end space-y-3">
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

        {/* Netflix-style 5 Carousel Indicators */}
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
