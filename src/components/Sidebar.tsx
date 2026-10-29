'use client';

import React, { useEffect } from 'react';
import { Film, Tv, PlaySquare, Home, X, ChevronRight, Server } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeLibrary: 'movies' | 'tv' | 'youtube' | null;
  onSelectLibrary: (lib: 'movies' | 'tv' | 'youtube' | null) => void;
  appName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  activeLibrary,
  onSelectLibrary,
  appName = 'HomeStream',
}) => {
  // Close on Escape key or '[' hotkey
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll on small screens when open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [isOpen]);

  const libraryItems = [
    {
      id: 'movies' as const,
      name: 'Movies',
      description: 'All movies on your Jellyfin server',
      icon: Film,
      badge: 'A–Z',
      color: 'from-blue-600 to-indigo-700',
    },
    {
      id: 'tv' as const,
      name: 'TV Shows',
      description: 'All series on your Jellyfin server',
      icon: Tv,
      badge: 'A–Z',
      color: 'from-purple-600 to-pink-700',
    },
    {
      id: 'youtube' as const,
      name: 'YouTube',
      description: 'Downloaded YouTube library',
      icon: PlaySquare,
      badge: 'A–Z',
      color: 'from-red-600 to-rose-700',
    },
  ];

  return (
    <>
      {/* Dimmed Backdrop Overlay */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sliding Sidebar Panel */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-[#121212] border-r border-neutral-800/80 z-50 flex flex-col transform transition-transform duration-300 ease-out shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-label="Jellyfin Libraries Sidebar"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-950/40">
              <span className="font-black text-white text-lg tracking-wider">H</span>
            </div>
            <div>
              <div className="font-extrabold text-white text-base tracking-wide flex items-center space-x-1.5">
                <span>{appName}</span>
              </div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-widest font-semibold flex items-center space-x-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Jellyfin Library</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Close sidebar (Esc)"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Content */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
          {/* Main Streaming Feed Button */}
          <div>
            <button
              onClick={() => {
                onSelectLibrary(null);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${
                activeLibrary === null
                  ? 'bg-red-600 text-white font-semibold shadow-lg shadow-red-950/40'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/60'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Home size={19} />
                <div className="text-left">
                  <div className="text-sm font-semibold">Home Streaming Feed</div>
                  <div className={`text-[11px] ${activeLibrary === null ? 'text-red-100' : 'text-neutral-400'}`}>
                    Netflix-style rows & categories
                  </div>
                </div>
              </div>
              <ChevronRight size={16} className="opacity-70" />
            </button>
          </div>

          {/* Section: Jellyfin A-Z Libraries */}
          <div className="space-y-2">
            <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center space-x-1.5">
              <Server size={12} className="text-red-500" />
              <span>Jellyfin Media (A–Z)</span>
            </div>
            <p className="px-2 text-[11px] text-neutral-400">
              Direct access to all media stored on your server, sorted alphabetically.
            </p>

            <div className="space-y-1.5 pt-1">
              {libraryItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeLibrary === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectLibrary(item.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all group ${
                      isSelected
                        ? 'bg-neutral-800 text-white border border-red-500/50 shadow-md'
                        : 'text-neutral-300 hover:text-white hover:bg-neutral-800/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-3.5">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 ${
                          isSelected
                            ? 'bg-red-600 text-white shadow'
                            : 'bg-neutral-800 text-neutral-300 group-hover:text-white'
                        }`}
                      >
                        <Icon size={19} />
                      </div>
                      <div className="text-left">
                        <div className="text-sm font-bold flex items-center space-x-2">
                          <span>{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-700/80 text-neutral-300 font-mono font-medium">
                            {item.badge}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 line-clamp-1">
                          {item.description}
                        </div>
                      </div>
                    </div>

                    <ChevronRight
                      size={16}
                      className={`transition-transform duration-200 ${
                        isSelected ? 'text-red-500 translate-x-0.5' : 'text-neutral-400 group-hover:translate-x-0.5'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-[#0e0e0e]/50">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-medium text-neutral-300">Connected to Jellyfin</span>
            </span>
            <span className="text-[10px] text-neutral-400">Press Esc to close</span>
          </div>
        </div>
      </aside>
    </>
  );
};
