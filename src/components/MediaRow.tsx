'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '@/types';
import { MediaCard } from './MediaCard';

interface MediaRowProps {
  title: string;
  items: MediaItem[];
  isTop10?: boolean;
  onPlay: (item: MediaItem) => void;
  onOpenModal: (item: MediaItem) => void;
  onRequest?: (item: MediaItem) => void;
}

export const MediaRow: React.FC<MediaRowProps> = ({
  title,
  items,
  isTop10 = false,
  onPlay,
  onOpenModal,
  onRequest,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (rowRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { clientWidth } = rowRef.current;
      const scrollAmount = direction === 'left' ? -clientWidth * 0.75 : clientWidth * 0.75;
      rowRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="relative group/row my-1 md:my-2 px-4 md:px-12 select-none hover:z-30 transition-all duration-300">
      {/* Row Header */}
      <div className="flex items-center justify-between mb-1 relative z-20">
        <h2 className="text-lg md:text-xl font-bold text-white tracking-wide hover:text-red-500 cursor-pointer transition-colors">
          {title}
        </h2>
      </div>

      {/* Row Container with negative margin so rows maintain compact spacing */}
      <div className="relative -my-24 md:-my-28">
        {/* Left Arrow Button */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-30 w-10 md:w-12 h-28 md:h-36 bg-black/75 hover:bg-black/95 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 rounded-r shadow-2xl"
            aria-label="Scroll Left"
          >
            <ChevronLeft size={32} />
          </button>
        )}

        {/* Scrollable Track: py-28 md:py-32 provides 112px-128px vertical clearance so popup hover previews never get cut off */}
        <div
          ref={rowRef}
          onScroll={handleScroll}
          className="flex items-center space-x-2 md:space-x-3 overflow-x-auto no-scrollbar scroll-smooth py-28 md:py-32 px-1"
        >
          {items.map((item, index) => (
            <MediaCard
              key={`${item.id}-${index}`}
              item={item}
              rankNumber={isTop10 ? index + 1 : undefined}
              onPlay={onPlay}
              onOpenModal={onOpenModal}
              onRequest={onRequest}
            />
          ))}
        </div>

        {/* Right Arrow Button */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-30 w-10 md:w-12 h-28 md:h-36 bg-black/75 hover:bg-black/95 text-white flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity duration-300 rounded-l shadow-2xl"
            aria-label="Scroll Right"
          >
            <ChevronRight size={32} />
          </button>
        )}
      </div>
    </div>
  );
};
