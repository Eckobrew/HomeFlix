'use client';

import React, { useState } from 'react';
import { X, Download, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { MediaItem } from '@/types';

interface RequestDialogProps {
  item: MediaItem | null;
  onClose: () => void;
  onSuccess: (item: MediaItem) => void;
}

export const RequestDialog: React.FC<RequestDialogProps> = ({
  item,
  onClose,
  onSuccess,
}) => {
  const [seasonChoice, setSeasonChoice] = useState<'all' | 'first' | 'latest'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!item) return null;

  const handleSubmitRequest = async () => {
    setIsSubmitting(true);
    setError(null);
    setResultMessage(null);

    try {
      const tmdbId = item.tmdbId || (item.seerrId ? Number(item.seerrId) : undefined);
      if (!tmdbId) {
        throw new Error('Missing TMDB ID for this media item.');
      }

      let seasons: number[] | undefined;
      if (item.type === 'Series') {
        if (seasonChoice === 'first') seasons = [1];
        else if (seasonChoice === 'latest' && item.seasonsCount) seasons = [item.seasonsCount];
      }

      const res = await fetch('/api/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaType: item.type === 'Series' ? 'tv' : 'movie',
          mediaId: tmdbId,
          seasons,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit request to Seerr.');
      }

      setResultMessage(data.message || 'Request submitted successfully!');
      onSuccess(item);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-[#1a1a1a] rounded-xl overflow-hidden shadow-2xl border border-neutral-700 p-6 space-y-5 animate-fade-in text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div className="flex items-center space-x-2 text-red-500 font-bold">
            <Download size={20} />
            <span className="text-lg text-white">Request to Download</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Media Preview */}
        <div className="flex space-x-4">
          <img
            src={item.posterUrl || item.backdropUrl}
            alt={item.title}
            className="w-24 h-36 object-cover rounded shadow-md shrink-0 bg-neutral-800"
          />
          <div className="space-y-1.5 flex flex-col justify-center">
            <h3 className="font-bold text-lg text-white leading-tight">{item.title}</h3>
            <div className="flex items-center space-x-2 text-xs text-neutral-400">
              <span>{item.type}</span>
              <span>•</span>
              <span>{item.year || '2024'}</span>
              <span>•</span>
              <span className="text-emerald-400">{item.matchPercentage || 95}% Match</span>
            </div>
            <p className="text-xs text-neutral-400 line-clamp-3 leading-relaxed">
              {item.overview}
            </p>
          </div>
        </div>

        {/* TV Show Season Selector */}
        {item.type === 'Series' && (
          <div className="space-y-2 pt-2 border-t border-neutral-800">
            <label className="text-xs font-semibold text-neutral-300">
              Select Seasons to Request:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSeasonChoice('all')}
                className={`py-2 px-3 rounded text-xs font-medium border transition-colors ${
                  seasonChoice === 'all'
                    ? 'bg-red-600/20 border-red-500 text-white font-bold'
                    : 'bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                All Seasons
              </button>
              <button
                type="button"
                onClick={() => setSeasonChoice('first')}
                className={`py-2 px-3 rounded text-xs font-medium border transition-colors ${
                  seasonChoice === 'first'
                    ? 'bg-red-600/20 border-red-500 text-white font-bold'
                    : 'bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                Season 1 Only
              </button>
              <button
                type="button"
                onClick={() => setSeasonChoice('latest')}
                className={`py-2 px-3 rounded text-xs font-medium border transition-colors ${
                  seasonChoice === 'latest'
                    ? 'bg-red-600/20 border-red-500 text-white font-bold'
                    : 'bg-neutral-800/80 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
              >
                Latest Season
              </button>
            </div>
          </div>
        )}

        {/* Success / Error Feedback */}
        {resultMessage && (
          <div className="flex items-center space-x-2 p-3 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs">
            <CheckCircle size={16} className="shrink-0" />
            <span>{resultMessage}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center space-x-2 p-3 rounded bg-red-950/80 border border-red-800 text-red-300 text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-semibold text-neutral-300 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitRequest}
            disabled={isSubmitting || Boolean(resultMessage)}
            className="flex items-center space-x-2 px-6 py-2 rounded bg-red-600 hover:bg-red-700 font-bold text-sm text-white transition-all shadow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Sending Request...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Confirm Request</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
