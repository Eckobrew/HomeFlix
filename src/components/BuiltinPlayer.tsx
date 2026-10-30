'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Hls from 'hls.js';
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
  Cast,
  Download,
} from 'lucide-react';
import { MediaItem, Episode, SubtitleTrack } from '@/types';

interface BuiltinPlayerProps {
  item: MediaItem;
  episode?: Episode;
  onClose: () => void;
  onNextEpisode?: () => void;
  jellyfinServerUrl?: string;
  jellyfinApiKey?: string;
  isDownloading?: boolean;
  downloadProgress?: number;
  torrentHash?: string;
}

export const BuiltinPlayer: React.FC<BuiltinPlayerProps> = ({
  item,
  episode,
  onClose,
  onNextEpisode,
  jellyfinServerUrl,
  jellyfinApiKey,
  isDownloading,
  downloadProgress,
  torrentHash,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isVolumeInteracting, setIsVolumeInteracting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [buffered, setBuffered] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<number | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [isMidStreamBuffering, setIsMidStreamBuffering] = useState(false);
  const [isLoadingEpisode, setIsLoadingEpisode] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [isTranscoding, setIsTranscoding] = useState(false);
  const [isLoadingStream, setIsLoadingStream] = useState(true);

  const isItemDownloading = Boolean(
    isDownloading ||
    item.isDownloading ||
    item.downloadStreamUrl?.includes('/api/stream/download') ||
    item.videoStreamUrl?.includes('/api/stream/download')
  );

  const [activeDownloadProgress, setActiveDownloadProgress] = useState<number>(
    downloadProgress ?? item.downloadProgress ?? 0
  );
  const [activeDownloadSpeed, setActiveDownloadSpeed] = useState<number>(
    item.downloadSpeed ?? 0
  );
  const [downloadedBytes, setDownloadedBytes] = useState<number>(item.downloaded || 0);
  const [resolvedTorrentHash, setResolvedTorrentHash] = useState<string | null>(
    torrentHash ||
    item.torrentHash ||
    (item.downloadStreamUrl?.match(/hash=([^&]+)/)?.[1]) ||
    (item.videoStreamUrl?.match(/hash=([^&]+)/)?.[1]) ||
    null
  );

  useEffect(() => {
    if (!isItemDownloading) return;

    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/downloads');
        if (!res.ok) return;
        const data = await res.json();
        const cleanItemTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const found = data.items?.find((t: any) => {
          if (resolvedTorrentHash && t.hash.toLowerCase() === resolvedTorrentHash.toLowerCase()) return true;
          const cleanName = (t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanName.includes(cleanItemTitle) || cleanItemTitle.includes(cleanName);
        });

        if (found && isMounted) {
          if (!resolvedTorrentHash) {
            setResolvedTorrentHash(found.hash);
          }
          setActiveDownloadProgress(found.progressPercent);
          setActiveDownloadSpeed(found.downloadSpeed);
          if (typeof found.downloaded === 'number') {
            setDownloadedBytes(found.downloaded);
          }

          const minBuffer = 15 * 1024 * 1024; // 15MB initial buffer threshold
          if (found.downloaded >= minBuffer || found.progressPercent >= 99) {
            const nextStreamUrl = found.streamUrl || `/api/stream/download?hash=${found.hash}`;
            setStreamUrl(nextStreamUrl);
            setIsLoadingStream(false);
            setStreamError(false);
          } else {
            setIsLoadingStream(true);
          }
        }
      } catch {
        // Ignore background polling errors
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isItemDownloading, resolvedTorrentHash, item.title]);
  const [hasTriedFallbackTranscode, setHasTriedFallbackTranscode] = useState(false);
  const [playbackDuration, setPlaybackDuration] = useState<number>(0);

  // Subtitles state
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState(false);

  // Chromecast / Remote Playback state
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [isCastConnecting, setIsCastConnecting] = useState(false);
  const [castDeviceName, setCastDeviceName] = useState<string>('');

  const currentTimeRef = useRef(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const streamUrlRef = useRef(streamUrl);
  useEffect(() => {
    streamUrlRef.current = streamUrl;
  }, [streamUrl]);

  const lastCastedUrlRef = useRef<string>('');
  const lastCastedKeyRef = useRef<string>('');

  // Active episode / target ID
  const [activeEpisode, setActiveEpisode] = useState<Episode | undefined>(episode);
  const [activePlayableId, setActivePlayableId] = useState<string | undefined>(
    episode?.jellyfinId ||
    episode?.id ||
    item.playableEpisodeId ||
    (item.type !== 'Series' ? (item.jellyfinId || item.id) : undefined)
  );

  const isJellyfinItem = Boolean(item.source === 'jellyfin' || item.jellyfinId);

  // Series playlist episodes
  const [seriesEpisodes, setSeriesEpisodes] = useState<Episode[]>(
    item.seasons?.flatMap((s) => s.episodes || []) || []
  );

  // Load full media details (especially durationMinutes / runtime) for accurate timeline display
  useEffect(() => {
    const hasDuration =
      (item.durationMinutes && item.durationMinutes > 0) ||
      (item.totalDurationTicks && item.totalDurationTicks > 0) ||
      (activeEpisode?.durationMinutes && activeEpisode.durationMinutes > 0);

    if (!hasDuration && item.id) {
      fetch(`/api/media/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.item?.durationMinutes) {
            const durSec = data.item.durationMinutes * 60;
            setPlaybackDuration(durSec);
            setDuration(durSec);
          }
        })
        .catch(() => {});
    }
  }, [item.id, item.durationMinutes, item.totalDurationTicks, activeEpisode?.durationMinutes]);

  // For active torrent streaming, probe the exact duration directly from ffprobe
  useEffect(() => {
    if (isItemDownloading) {
      const hash =
        resolvedTorrentHash ||
        torrentHash ||
        item.torrentHash ||
        (item.downloadStreamUrl?.match(/hash=([^&]+)/)?.[1]) ||
        (item.videoStreamUrl?.match(/hash=([^&]+)/)?.[1]);

      if (hash) {
        fetch(`/api/stream/download?hash=${hash}&probe=1`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.durationSeconds && data.durationSeconds > 0) {
              setPlaybackDuration(data.durationSeconds);
              setDuration(data.durationSeconds);
            }
          })
          .catch(() => {});
      }
    }
  }, [isItemDownloading, resolvedTorrentHash, torrentHash, item.torrentHash, item.downloadStreamUrl, item.videoStreamUrl]);

  // If item is a series, ensure series seasons/episodes are loaded for navigation & next episode
  useEffect(() => {
    if (item.type === 'Series') {
      if (item.seasons && item.seasons.length > 0) {
        const allEps = item.seasons.flatMap((s) => s.episodes || []);
        setSeriesEpisodes(allEps);
        if (!activeEpisode) {
          const found = activePlayableId
            ? allEps.find((ep) => ep.jellyfinId === activePlayableId || ep.id === activePlayableId)
            : allEps.find((ep) => ep.videoStreamUrl || ep.jellyfinId);
          if (found) {
            setActiveEpisode(found);
            if (!activePlayableId) setActivePlayableId(found.jellyfinId || found.id);
          }
        }
        return;
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
            setSeriesEpisodes(allEps);
            if (!activeEpisode) {
              const found = targetPlayableId
                ? allEps.find((ep: any) => ep.jellyfinId === targetPlayableId || ep.id === targetPlayableId)
                : allEps.find((ep: any) => ep.videoStreamUrl || ep.jellyfinId);
              if (found) {
                setActiveEpisode(found);
              }
            }
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingEpisode(false));
    }
  }, [item, activeEpisode, activePlayableId]);

  // Compute next episode in TV series
  const nextEpisode = useMemo(() => {
    if (!seriesEpisodes || seriesEpisodes.length === 0) return null;
    const currentId = activeEpisode?.jellyfinId || activeEpisode?.id || activePlayableId;
    const currentIdx = seriesEpisodes.findIndex(
      (ep) => (currentId && (ep.jellyfinId === currentId || ep.id === currentId)) ||
              (activeEpisode && ep.seasonNumber === activeEpisode.seasonNumber && ep.episodeNumber === activeEpisode.episodeNumber)
    );
    if (currentIdx !== -1 && currentIdx + 1 < seriesEpisodes.length) {
      return seriesEpisodes[currentIdx + 1];
    }
    return null;
  }, [seriesEpisodes, activeEpisode, activePlayableId]);

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

  const currentTitle = useMemo(() => {
    return activeEpisode
      ? `${item.title}: S${activeEpisode.seasonNumber}E${activeEpisode.episodeNumber} - ${activeEpisode.name}`
      : item.title;
  }, [item.title, activeEpisode]);

  // Synchronize subtitle track change locally and on remote Chromecast receiver
  const changeSubtitleTrack = useCallback(
    (subId: string | null) => {
      setSelectedSubtitleId(subId);

      // If casting via Google Cast SDK, update active tracks on receiver
      if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
        try {
          const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
          const media = session?.getMediaSession();
          if (media) {
            let activeTrackIds: number[] = [];
            if (subId !== null) {
              const subIdx = subtitles.findIndex((s) => s.id === subId);
              if (subIdx !== -1) {
                activeTrackIds = [subIdx + 1];
              }
            }
            const tracksRequest = new (window as any).chrome.cast.media.EditTracksInfoRequest(activeTrackIds);
            media.editTracksInfo(
              tracksRequest,
              () => console.log('Chromecast subtitle track updated:', activeTrackIds),
              (err: any) => console.warn('Failed to update Chromecast subtitle track:', err)
            );
          }
        } catch (e) {
          console.warn('Chromecast subtitle edit exception:', e);
        }
      }
    },
    [isCasting, subtitles]
  );

  // Load media stream with metadata and subtitles onto connected Chromecast receiver
  const loadCastMedia = useCallback(() => {
    try {
      if (typeof window === 'undefined' || !(window as any).cast?.framework) return;
      const castContext = (window as any).cast.framework.CastContext.getInstance();
      const session = castContext.getCurrentSession();
      if (!session) return;

      const deviceName = session.getCastDevice()?.friendlyName;
      if (deviceName) setCastDeviceName(deviceName);

      const rawUrl = streamUrlRef.current || videoRef.current?.currentSrc || videoRef.current?.src;
      if (!rawUrl) return;

      const absoluteMediaUrl = new URL(rawUrl, window.location.href).href;
      lastCastedUrlRef.current = absoluteMediaUrl;
      lastCastedKeyRef.current = (activeEpisode ? `${item.id}-${activeEpisode.id}` : item.id) + '-' + rawUrl;

      const isHls = absoluteMediaUrl.includes('.m3u8');
      const contentType = isHls ? 'application/x-mpegURL' : 'video/mp4';

      const mediaInfo = new (window as any).chrome.cast.media.MediaInfo(absoluteMediaUrl, contentType);
      mediaInfo.metadata = new (window as any).chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = currentTitle;
      mediaInfo.metadata.subtitle = activeEpisode ? item.title : (item.overview || '');

      const poster = activeEpisode?.thumbnailUrl || item.backdropUrl || item.posterUrl;
      if (poster) {
        mediaInfo.metadata.images = [{ url: new URL(poster, window.location.href).href }];
      }

      mediaInfo.streamType = (window as any).chrome.cast.media.StreamType.BUFFERED;

      if (subtitles && subtitles.length > 0 && (window as any).chrome?.cast?.media?.Track) {
        mediaInfo.tracks = subtitles.map((sub, idx) => {
          const track = new (window as any).chrome.cast.media.Track(
            idx + 1,
            (window as any).chrome.cast.media.TrackType.TEXT
          );
          track.trackContentId = new URL(sub.src, window.location.href).href;
          track.trackContentType = 'text/vtt';
          track.subtype = (window as any).chrome.cast.media.TextTrackType.SUBTITLES;
          track.name = sub.title;
          track.language = sub.language;
          return track;
        });
      }

      const request = new (window as any).chrome.cast.media.LoadRequest(mediaInfo);
      request.currentTime = videoRef.current?.currentTime || currentTimeRef.current || 0;
      request.autoplay = true;

      session.loadMedia(request).then(
        () => {
          setIsCasting(true);
          setIsCastConnecting(false);
          if (videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        },
        (err: any) => {
          console.error('Error loading media to Chromecast:', err);
          setIsCastConnecting(false);
        }
      );
    } catch (e) {
      console.error('Cast media load exception:', e);
      setIsCastConnecting(false);
    }
  }, [currentTitle, item, activeEpisode, subtitles]);

  // Disconnect from Chromecast session
  const handleDisconnectCast = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        castContext.endCurrentSession(true);
      } catch (e) {}
    }
    const video = videoRef.current;
    if (video && 'remote' in video && (video as any).remote?.prompt) {
      (video as any).remote.prompt().catch(() => {});
    }
    setIsCasting(false);
    setIsCastConnecting(false);
    setCastDeviceName('');
    lastCastedUrlRef.current = '';
    lastCastedKeyRef.current = '';
    if (videoRef.current) {
      videoRef.current.currentTime = currentTimeRef.current || currentTime;
      if (isPlaying) {
        videoRef.current.play().catch(console.error);
      }
    }
  }, [currentTime, isPlaying]);

  // Cast button click handler supporting both Google Cast SDK and RemotePlayback API
  const handleCastClick = useCallback(async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (isCasting) {
      handleDisconnectCast();
      return;
    }

    setIsCastConnecting(true);

    // 1. Guard against insecure HTTP contexts where Chrome explicitly blocks casting
    if (
      typeof window !== 'undefined' &&
      !window.isSecureContext &&
      window.location.protocol === 'http:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      setIsCastConnecting(false);
      const httpsUrl = `https://homeflix.eckonet.uk${window.location.pathname}${window.location.search}`;
      const confirmed = window.confirm(
        'Chromecast casting is disabled by Google Chrome on unencrypted HTTP.\n\nWould you like to switch to HTTPS at https://homeflix.eckonet.uk now?'
      );
      if (confirmed) {
        window.location.href = httpsUrl;
      }
      return;
    }

    // 2. Google Cast Framework (Chrome macOS, Windows, Linux, Android)
    if (typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        try {
          castContext.setOptions({
            receiverApplicationId: (window as any).chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
            autoJoinPolicy: (window as any).chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED,
          });
        } catch (initErr) {
          // Already initialized
        }
        await castContext.requestSession();
        return;
      } catch (err: any) {
        if (err?.errorCode === 'cancel' || err?.message?.includes('cancel')) {
          setIsCastConnecting(false);
          return;
        }
        console.warn('Google Cast requestSession fallback:', err);
      }
    }

    // 3. HTMLMediaElement Remote Playback API (Android Chrome / Samsung Internet)
    const video = videoRef.current;
    if (video && 'remote' in video && (video as any).remote?.prompt) {
      try {
        await (video as any).remote.prompt();
        return;
      } catch (err: any) {
        setIsCastConnecting(false);
        if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
          return;
        }
        console.warn('RemotePlayback prompt fallback:', err);
      }
    }

    setIsCastConnecting(false);
    alert(
      'To cast to Chromecast or Google TV:\n• Open HomeFlix via HTTPS: https://homeflix.eckonet.uk\n• Ensure your phone/Mac is on the same Wi-Fi as your Chromecast.\n• Use Google Chrome or Samsung Internet.'
    );
  }, [isCasting, handleDisconnectCast]);

  // Initialize Google Cast SDK & HTMLMediaElement Remote Playback
  useEffect(() => {
    // 1. Check Native Remote Playback API
    const video = videoRef.current;
    if (video && 'remote' in video && (video as any).remote) {
      const remote = (video as any).remote;

      const handleConnecting = () => {
        setIsCastConnecting(true);
        setIsCasting(false);
      };
      const handleConnect = () => {
        setIsCastConnecting(false);
        setIsCasting(true);
      };
      const handleDisconnect = () => {
        setIsCastConnecting(false);
        setIsCasting(false);
      };

      remote.addEventListener('connecting', handleConnecting);
      remote.addEventListener('connect', handleConnect);
      remote.addEventListener('disconnect', handleDisconnect);

      if (remote.watchAvailability) {
        remote
          .watchAvailability((available: boolean) => {
            if (available) setIsCastAvailable(true);
          })
          .catch(() => {
            setIsCastAvailable(true);
          });
      } else {
        setIsCastAvailable(true);
      }
    }

    // 2. Initialize Google Cast Framework
    const initCastFramework = () => {
      try {
        if (typeof window === 'undefined' || !(window as any).cast?.framework) return;
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        castContext.setOptions({
          receiverApplicationId: (window as any).chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID || 'CC1AD845',
          autoJoinPolicy: (window as any).chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED,
        });

        const CastState = (window as any).cast.framework.CastState;
        const currentCastState = castContext.getCastState();
        if (currentCastState && currentCastState !== CastState.NO_DEVICES_AVAILABLE) {
          setIsCastAvailable(true);
        }
        if (currentCastState === CastState.CONNECTED) {
          setIsCasting(true);
          const dev = castContext.getCurrentSession()?.getCastDevice()?.friendlyName;
          if (dev) setCastDeviceName(dev);
        }

        castContext.addEventListener(
          (window as any).cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          (event: any) => {
            if (event.castState === CastState.CONNECTED) {
              setIsCasting(true);
              setIsCastConnecting(false);
            } else if (event.castState === CastState.CONNECTING) {
              setIsCastConnecting(true);
            } else {
              setIsCasting(false);
              setIsCastConnecting(false);
            }
            if (event.castState !== CastState.NO_DEVICES_AVAILABLE) {
              setIsCastAvailable(true);
            }
          }
        );

        castContext.addEventListener(
          (window as any).cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
          (event: any) => {
            const SessionState = (window as any).cast.framework.SessionState;
            if (
              event.sessionState === SessionState.SESSION_STARTED ||
              event.sessionState === SessionState.SESSION_RESUMED
            ) {
              setIsCasting(true);
              setIsCastConnecting(false);
              const session = castContext.getCurrentSession();
              const dev = session?.getCastDevice()?.friendlyName;
              if (dev) setCastDeviceName(dev);
              loadCastMedia();
            } else if (event.sessionState === SessionState.SESSION_ENDED) {
              setIsCasting(false);
              setIsCastConnecting(false);
              setCastDeviceName('');
              lastCastedUrlRef.current = '';
              lastCastedKeyRef.current = '';
            }
          }
        );
      } catch (err) {
        console.warn('Cast framework initialization error:', err);
      }
    };

    if (typeof window !== 'undefined') {
      if ((window as any).cast?.framework) {
        initCastFramework();
      } else {
        const prevOnGCast = (window as any).__onGCastApiAvailable;
        (window as any).__onGCastApiAvailable = (isAvailable: boolean) => {
          if (prevOnGCast) prevOnGCast(isAvailable);
          if (isAvailable) initCastFramework();
        };
      }
    }
  }, [loadCastMedia]);

  // Google Cast receiver position polling & playback state sync
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isCasting) {
      interval = setInterval(() => {
        if (typeof window !== 'undefined' && (window as any).cast?.framework) {
          try {
            const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
            const media = session?.getMediaSession();
            if (media) {
              const estimatedTime = media.getEstimatedTime();
              if (typeof estimatedTime === 'number' && !isScrubbing && estimatedTime > 0) {
                setCurrentTime(estimatedTime);
              }
              const playerState = media.playerState;
              if (playerState === 'PLAYING') {
                setIsPlaying(true);
              } else if (playerState === 'PAUSED') {
                setIsPlaying(false);
              }
            }
          } catch (e) {}
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCasting, isScrubbing]);

  // Auto-reload on Chromecast ONLY when media/episode actually changes while casting
  useEffect(() => {
    if (isCasting && streamUrl && lastCastedKeyRef.current) {
      const currentItemKey = (activeEpisode ? `${item.id}-${activeEpisode.id}` : item.id) + '-' + streamUrl;
      if (lastCastedKeyRef.current !== currentItemKey) {
        lastCastedKeyRef.current = currentItemKey;
        loadCastMedia();
      }
    }
  }, [streamUrl, activeEpisode, item.id, isCasting, loadCastMedia]);

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
    if (isItemDownloading) {
      const minBuffer = 15 * 1024 * 1024;
      const readyToPlay = downloadedBytes >= minBuffer || activeDownloadProgress >= 99;
      if (readyToPlay && (item.downloadStreamUrl || item.videoStreamUrl)) {
        setStreamUrl(item.downloadStreamUrl || item.videoStreamUrl || '');
        setIsLoadingStream(false);
      } else {
        // Keep in loading/buffering state until poll() finds >= 15MB
        setIsLoadingStream(true);
      }
      return;
    }

    if (!activePlayableId && item.type === 'Series') {
      return;
    }

    if (!isJellyfinItem) {
      setStreamUrl(activeEpisode?.videoStreamUrl || item.downloadStreamUrl || item.videoStreamUrl || '');
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
    // If still downloading and below 15MB initial buffer, ignore playback error and continue buffering
    if (isItemDownloading && downloadedBytes < 15 * 1024 * 1024) {
      console.warn('Playback error ignored during initial torrent download buffer');
      return;
    }

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
      if (isPlaying && !showSubtitleMenu && !isCasting) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying, showSubtitleMenu, isCasting]);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [resetControlsTimer]);

  // Attach media stream via Hls.js or native HTML5 video
  useEffect(() => {
    if (!streamUrl || !videoRef.current) return;
    const video = videoRef.current;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Determine target resume position in seconds
    let resumeSeconds = 0;
    if (activeEpisode?.playbackPositionTicks && activeEpisode.playbackPositionTicks > 0) {
      resumeSeconds = Math.floor(activeEpisode.playbackPositionTicks / 10000000);
    } else if (item.playbackPositionTicks && item.playbackPositionTicks > 0) {
      resumeSeconds = Math.floor(item.playbackPositionTicks / 10000000);
    }

    const isHls = streamUrl.includes('.m3u8');

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoadingStream(false);
        if (resumeSeconds > 0) {
          video.currentTime = resumeSeconds;
          setCurrentTime(resumeSeconds);
        }
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              handlePlaybackError();
              break;
          }
        }
      });
    } else if (isHls && video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari HLS
      video.src = streamUrl;
      const onLoaded = () => {
        setIsLoadingStream(false);
        if (resumeSeconds > 0) {
          video.currentTime = resumeSeconds;
          setCurrentTime(resumeSeconds);
        }
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        video.removeEventListener('loadedmetadata', onLoaded);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.load();
    } else {
      // Direct MP4 video stream
      video.src = streamUrl;
      const onLoaded = () => {
        setIsLoadingStream(false);
        if (resumeSeconds > 0) {
          video.currentTime = resumeSeconds;
          setCurrentTime(resumeSeconds);
        }
        video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        video.removeEventListener('loadedmetadata', onLoaded);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.load();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  // Video event handlers
  const updateBufferState = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const effectiveDuration = duration > 0 ? duration : (knownDurationSeconds > 0 ? knownDurationSeconds : (videoRef.current.duration || 0));
    if (effectiveDuration > 0 && videoRef.current.buffered.length > 0) {
      const b = videoRef.current.buffered;
      let buffEnd = 0;
      for (let i = 0; i < b.length; i++) {
        if (b.start(i) <= cur + 2 && cur <= b.end(i)) {
          buffEnd = b.end(i);
          break;
        }
      }
      if (buffEnd === 0 && b.length > 0) {
        buffEnd = b.end(b.length - 1);
      }
      setBuffered(Math.min(100, Math.max(0, (buffEnd / effectiveDuration) * 100)));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && !isScrubbing) {
      const cur = videoRef.current.currentTime;
      setCurrentTime(cur);

      // Always anchor duration to true whole movie length (knownDurationSeconds)
      setDuration((prev) => {
        if (knownDurationSeconds > 0) {
          return knownDurationSeconds;
        }
        return Math.max(prev, cur);
      });

      updateBufferState();
    }
  };

  const handleProgress = () => {
    updateBufferState();
  };

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetDur = displayDuration || 100;
    setHoverTime(pos * targetDur);
    setHoverPos(pos * 100);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const videoDur = videoRef.current.duration;
      // Prefer knownDurationSeconds so transcode chunk duration never shrinks or skews the whole movie length
      if (knownDurationSeconds > 0) {
        setDuration(knownDurationSeconds);
      } else if (Number.isFinite(videoDur) && videoDur > 30) {
        setDuration(videoDur);
      }
    }
  };

  const displayDuration = knownDurationSeconds > 0
    ? knownDurationSeconds
    : duration > 0
      ? duration
      : (item.durationMinutes ? item.durationMinutes * 60 : 0);

  const playPercent = displayDuration > 0
    ? Math.min(100, Math.max(0, (currentTime / displayDuration) * 100))
    : 0;

  const togglePlay = () => {
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
        const media = session?.getMediaSession();
        if (media) {
          if (isPlaying) {
            media.pause(null, () => setIsPlaying(false), console.error);
          } else {
            media.play(null, () => setIsPlaying(true), console.error);
          }
          return;
        }
      } catch (err) {
        console.warn('Cast play/pause error:', err);
      }
    }
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
    const targetDuration = duration > 0 ? duration : (knownDurationSeconds || videoRef.current?.duration || 100);
    const newTime = Math.max(0, Math.min(currentTime + seconds, targetDuration));
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
        const media = session?.getMediaSession();
        if (media) {
          const seekReq = new (window as any).chrome.cast.media.SeekRequest();
          seekReq.currentTime = newTime;
          media.seek(seekReq, () => setCurrentTime(newTime), console.error);
          resetControlsTimer();
          return;
        }
      } catch (err) {
        console.warn('Cast seek error:', err);
      }
    }
    if (!videoRef.current) return;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    resetControlsTimer();
  };

  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    setIsScrubbing(true);
    resetControlsTimer();
  };

  const handleScrubEnd = () => {
    setIsScrubbing(false);
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
        const media = session?.getMediaSession();
        if (media) {
          const seekReq = new (window as any).chrome.cast.media.SeekRequest();
          seekReq.currentTime = currentTime;
          media.seek(seekReq, () => {}, console.error);
          resetControlsTimer();
          return;
        }
      } catch (err) {
        console.warn('Cast scrub seek error:', err);
      }
    }
    if (videoRef.current) {
      videoRef.current.currentTime = currentTime;
    }
    resetControlsTimer();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number(e.target.value);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        castContext.setVolumeLevel(newVol);
      } catch (e) {}
    }
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const castContext = (window as any).cast.framework.CastContext.getInstance();
        castContext.setMuted(nextMuted);
      } catch (e) {}
    }
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  // Report playback progress back to Jellyfin for Resume / Continue Watching tracking
  const reportProgress = useCallback((isStopped = false, overrideTicks?: number) => {
    const targetId = activePlayableId || item.playableEpisodeId || (item.type !== 'Series' ? item.jellyfinId || item.id : undefined);
    if (!targetId || !videoRef.current) return;

    const currentSecs = videoRef.current.currentTime;
    const positionTicks = typeof overrideTicks === 'number' ? overrideTicks : Math.round(currentSecs * 10000000);
    if (positionTicks < 0) return;

    const payload = JSON.stringify({
      itemId: targetId,
      positionTicks,
      isPaused: !isPlaying,
      isStopped,
    });

    if (isStopped && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/playback/progress', payload);
    } else {
      fetch('/api/playback/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {});
    }
  }, [activePlayableId, item, isPlaying]);

  const handleRestart = () => {
    if (isCasting && typeof window !== 'undefined' && (window as any).cast?.framework) {
      try {
        const session = (window as any).cast.framework.CastContext.getInstance().getCurrentSession();
        const media = session?.getMediaSession();
        if (media) {
          const seekReq = new (window as any).chrome.cast.media.SeekRequest();
          seekReq.currentTime = 0;
          media.seek(seekReq, () => {
            setCurrentTime(0);
            setIsPlaying(true);
          }, console.error);
        }
      } catch (err) {
        console.warn('Cast restart error:', err);
      }
    }
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
    setCurrentTime(0);
    reportProgress(false, 0);
    resetControlsTimer();
  };

  const handleNextEpisode = () => {
    if (onNextEpisode) {
      onNextEpisode();
      return;
    }
    if (nextEpisode) {
      reportProgress(true);
      setActiveEpisode(nextEpisode);
      setCurrentTime(0);
      setDuration(nextEpisode.totalDurationTicks ? nextEpisode.totalDurationTicks / 10000000 : 0);
      setPlaybackDuration(0);

      if (isItemDownloading) {
        const hash = resolvedTorrentHash || item.torrentHash || (item.downloadStreamUrl?.match(/hash=([^&]+)/)?.[1]);
        if (hash) {
          const sNum = nextEpisode.seasonNumber || 1;
          const epNum = nextEpisode.episodeNumber;
          setStreamUrl(`/api/stream/download?hash=${hash}&season=${sNum}&episode=${epNum}`);
          setIsLoadingStream(false);
          resetControlsTimer();
          return;
        }
      }

      setActivePlayableId(nextEpisode.jellyfinId || nextEpisode.id);
      setStreamUrl('');
      setIsLoadingStream(true);
      resetControlsTimer();
    }
  };

  // Periodic progress reporting every 10 seconds while playing
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      reportProgress(false);
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, reportProgress]);

  const handleClose = () => {
    reportProgress(true);
    if (isCasting) {
      handleDisconnectCast();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    onClose();
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowLeft') seek(-10);
      if (e.key === 'ArrowRight') seek(10);
      if (e.key === '0' || e.key === 'Home') handleRestart();
      if ((e.key === 'n' || e.key === 'N') && (nextEpisode || onNextEpisode)) {
        handleNextEpisode();
      }
      if (e.key === 'f') toggleFullscreen();
      if (e.key === 'm') toggleMute();
      if (e.key === 'c' || e.key === 'C') {
        setShowSubtitleMenu((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration, currentTime, nextEpisode, onNextEpisode]);

  const formatTime = (secs: number) => {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden cursor-auto"
    >
      {/* Loading Indicator */}
      {(isLoadingEpisode || isLoadingStream) && (
        <div className="absolute inset-0 bg-black flex flex-col items-center justify-center z-40 space-y-4 p-6 text-center">
          <div className="relative">
            <div className="w-14 h-14 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
            {isItemDownloading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Download size={18} className="text-red-500 animate-pulse" />
              </div>
            )}
          </div>
          <div className="space-y-1.5 max-w-sm">
            <span className="text-sm font-bold text-white">
              {isItemDownloading
                ? downloadedBytes < 15 * 1024 * 1024
                  ? `Downloading initial pieces (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / 15 MB)...`
                  : `Preparing live stream (${activeDownloadProgress}%)...`
                : isLoadingEpisode
                ? 'Loading series episode...'
                : isTranscoding
                ? 'Preparing hardware-accelerated stream...'
                : 'Loading media stream...'}
            </span>
            {isItemDownloading && (
              <p className="text-xs text-neutral-400">
                {activeDownloadSpeed > 0
                  ? `Download speed: ${(activeDownloadSpeed / 1024 / 1024).toFixed(1)} MB/s • Playback begins automatically once initial pieces arrive`
                  : 'Contacting qBittorrent downloader...'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Stream Error Dialog */}
      {streamError && (!isItemDownloading || downloadedBytes >= 15 * 1024 * 1024) && (
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
              onClick={handleClose}
              className="bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-semibold px-4 py-2.5 rounded transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* HTML5 Stream Player & PC Static Backdrop Preview */}
      <div className="relative w-full h-full flex items-center justify-center" onClick={togglePlay}>
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          onTimeUpdate={() => {
            if (isMidStreamBuffering) setIsMidStreamBuffering(false);
            handleTimeUpdate();
          }}
          onProgress={handleProgress}
          onWaiting={() => setIsMidStreamBuffering(true)}
          onStalled={() => setIsMidStreamBuffering(true)}
          onPlaying={() => setIsMidStreamBuffering(false)}
          onCanPlay={() => setIsMidStreamBuffering(false)}
          onLoadedMetadata={handleLoadedMetadata}
          onError={handlePlaybackError}
          className={isCasting ? 'hidden' : 'w-full h-full object-contain cursor-pointer'}
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

        {/* Mid-Stream Buffering Overlay when waiting for data */}
        {isMidStreamBuffering && !isLoadingEpisode && !isLoadingStream && !isCasting && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-30">
            <div className="px-6 py-4 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 flex flex-col items-center space-y-2.5 shadow-2xl animate-in fade-in duration-200">
              <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-xs sm:text-sm font-semibold text-white/95">
                  {isItemDownloading
                    ? `Buffering stream (${activeDownloadProgress}% downloaded)...`
                    : 'Buffering stream...'}
                </p>
                {isItemDownloading && activeDownloadSpeed > 0 && (
                  <p className="text-[11px] text-blue-400 font-mono mt-0.5">
                    {(activeDownloadSpeed / 1024 / 1024).toFixed(1)} MB/s
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Static Backdrop Preview when Casting on PC */}
        {isCasting && (
          <div className="hidden md:flex absolute inset-0 w-full h-full items-center justify-center overflow-hidden">
            <img
              src={activeEpisode?.thumbnailUrl || item.backdropUrl || item.posterUrl}
              alt={currentTitle}
              className="w-full h-full object-cover opacity-50 filter blur-sm scale-105 pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/80 pointer-events-none" />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 space-y-4 z-10 pointer-events-auto">
              <div className="w-20 h-20 rounded-full bg-red-600/20 border-2 border-red-500/60 flex items-center justify-center text-red-500 animate-pulse shadow-2xl">
                <Cast size={40} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow">
                  Casting to {castDeviceName || 'Chromecast'}
                </h3>
                <p className="text-xs sm:text-sm text-neutral-400 max-w-md">
                  {currentTitle} is playing on your TV screen.
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDisconnectCast();
                }}
                className="px-4 py-1.5 rounded-full bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition-colors shadow"
              >
                Disconnect Cast
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Cast Remote UI (Samsung S26 / Mobile phones) */}
      {isCasting && (
        <div className="flex md:hidden absolute inset-0 flex-col justify-between p-4 pb-8 z-40 bg-neutral-950/95 overflow-y-auto pointer-events-auto">
          {/* Top Bar: Back button, Casting status badge, Disconnect */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleClose}
              className="p-2 -ml-2 rounded-full hover:bg-white/10 text-white"
              title="Close"
            >
              <ArrowLeft size={24} />
            </button>

            <div className="flex items-center space-x-1.5 bg-red-950/80 border border-red-800/80 px-2.5 py-1 rounded-full text-xs text-red-300 font-medium shadow">
              <Cast size={13} className="text-red-400" />
              <span className="truncate max-w-[130px]">{castDeviceName || 'Chromecast'}</span>
            </div>

            <button
              onClick={handleDisconnectCast}
              className="text-xs text-neutral-300 hover:text-white px-2.5 py-1 rounded border border-neutral-700 bg-neutral-900 active:bg-neutral-800"
            >
              Disconnect
            </button>
          </div>

          {/* Center: Static Artwork Preview & Metadata */}
          <div className="flex flex-col items-center justify-center my-auto space-y-4 px-2 py-4">
            <div className="relative w-44 aspect-[2/3] sm:w-52 rounded-xl overflow-hidden shadow-2xl border border-neutral-800">
              <img
                src={activeEpisode?.thumbnailUrl || item.posterUrl || item.backdropUrl}
                alt={currentTitle}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end p-3">
                <div className="flex items-center space-x-1 text-[11px] text-red-400 font-semibold">
                  <Cast size={12} />
                  <span>Playing on TV</span>
                </div>
              </div>
            </div>

            <div className="text-center space-y-1 max-w-xs">
              <h2 className="text-lg font-bold text-white line-clamp-1">{item.title}</h2>
              {activeEpisode && (
                <p className="text-xs text-neutral-400 font-medium line-clamp-1">
                  S{activeEpisode.seasonNumber}:E{activeEpisode.episodeNumber} • {activeEpisode.name}
                </p>
              )}
            </div>
          </div>

          {/* Bottom: Timeline Scrubber + Controls + Settings */}
          <div className="space-y-4">
            {/* Timeline Scrubber */}
            <div className="space-y-1.5">
              <div className="relative w-full flex items-center py-1">
                {/* Track background */}
                <div className="relative w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  {/* Download progress on disk */}
                  {isItemDownloading && activeDownloadProgress > 0 && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-blue-500/35 transition-all duration-300"
                      style={{ width: `${Math.min(100, activeDownloadProgress)}%` }}
                    />
                  )}
                  {/* Browser buffer in RAM */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-white/40 transition-all duration-150"
                    style={{ width: `${buffered}%` }}
                  />
                  {/* Playback progress */}
                  <div
                    className="absolute left-0 top-0 bottom-0 bg-red-600 transition-none"
                    style={{ width: `${playPercent}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={displayDuration || 100}
                  step={0.5}
                  value={currentTime}
                  onChange={handleScrubChange}
                  onMouseUp={handleScrubEnd}
                  onTouchEnd={handleScrubEnd}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>
              <div className="flex justify-between text-xs font-mono text-neutral-400">
                <span>{formatTime(currentTime)}</span>
                {isItemDownloading && (
                  <span className="text-[10px] text-blue-400 font-sans">
                    Downloaded: {activeDownloadProgress}%
                  </span>
                )}
                <span>{formatTime(displayDuration)}</span>
              </div>
            </div>

            {/* Primary Remote Touch Buttons */}
            <div className="flex items-center justify-center space-x-5 sm:space-x-7">
              <button
                onClick={handleRestart}
                className="p-2 text-neutral-400 hover:text-white active:scale-95 transition-all flex flex-col items-center"
                title="Restart from 0:00"
              >
                <RotateCcw size={20} />
                <span className="text-[10px] mt-0.5">Restart</span>
              </button>

              <button
                onClick={() => seek(-10)}
                className="p-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-white hover:bg-neutral-800 active:scale-95 transition-all"
                title="Rewind 10s"
              >
                <RotateCcw size={22} />
              </button>

              <button
                onClick={togglePlay}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center active:scale-90 transition-all shadow-xl"
                title={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause size={28} /> : <Play size={28} className="fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => seek(10)}
                className="p-2.5 rounded-full bg-neutral-900 border border-neutral-800 text-white hover:bg-neutral-800 active:scale-95 transition-all"
                title="Forward 10s"
              >
                <RotateCw size={22} />
              </button>

              {(item.type === 'Series' || onNextEpisode || nextEpisode) && (
                <button
                  onClick={handleNextEpisode}
                  disabled={!nextEpisode && !onNextEpisode}
                  className={`p-2 transition-all active:scale-95 flex flex-col items-center ${
                    nextEpisode || onNextEpisode ? 'text-neutral-400 hover:text-white' : 'text-neutral-600 opacity-40'
                  }`}
                  title="Next Episode"
                >
                  <SkipForward size={20} />
                  <span className="text-[10px] mt-0.5">Next</span>
                </button>
              )}
            </div>

            {/* Subtitles & Audio bar */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80 px-1">
              <button
                onClick={() => setShowSubtitleMenu(true)}
                className={`flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  selectedSubtitleId
                    ? 'bg-red-950/80 border-red-700 text-red-400'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-300'
                }`}
              >
                <Subtitles size={14} />
                <span>
                  Subtitles:{' '}
                  {selectedSubtitleId ? subtitles.find((s) => s.id === selectedSubtitleId)?.title || 'On' : 'Off'}
                </span>
              </button>

              <button
                onClick={toggleMute}
                className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Web Player Overlay Controls (Desktop / Standard View) */}
      <div
        className={`${isCasting ? 'hidden md:flex' : 'flex'} absolute inset-0 pointer-events-none transition-opacity duration-300 flex-col justify-between ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Header Bar */}
        <div className="p-3 sm:p-6 md:p-8 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto">
          {/* Back button + Media Title + In-Progress Badge */}
          <div className="flex items-center space-x-2.5 sm:space-x-4 min-w-0 flex-1 mr-4">
            <button
              onClick={handleClose}
              className="p-1.5 sm:p-2 rounded-full hover:bg-white/20 text-white transition-colors shrink-0"
              title="Back (Esc)"
            >
              <ArrowLeft className="w-6 h-6 sm:w-7 sm:h-7" />
            </button>
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center space-x-3">
                <h2 className="text-white font-bold text-base sm:text-lg md:text-xl drop-shadow truncate">
                  {item.title}
                </h2>
                {isItemDownloading && (
                  <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-blue-600/30 border border-blue-500/40 rounded-full text-blue-300 text-xs backdrop-blur-md shrink-0 shadow">
                    <Download className="w-3 h-3 animate-pulse" />
                    <span>
                      In-Progress ({activeDownloadProgress}%
                      {activeDownloadSpeed > 0 ? ` • ${(activeDownloadSpeed / 1024 / 1024).toFixed(1)} MB/s` : ''})
                    </span>
                  </div>
                )}
              </div>
              {activeEpisode && (
                <p className="text-neutral-400 text-xs sm:text-sm font-medium truncate">
                  Season {activeEpisode.seasonNumber}, Episode {activeEpisode.episodeNumber}: {activeEpisode.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Center Floating Play/Pause for Mobile & Quick Touch (Hidden while casting) */}
        {!isCasting && (
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
        )}

        {/* Bottom Controls Bar */}
        <div
          className="p-3 sm:p-6 md:p-8 pb-4 sm:pb-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent pointer-events-auto space-y-2 sm:space-y-3"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Timeline Scrubber Container */}
          <div
            className="relative group/scrubber cursor-pointer w-full flex items-center py-2 select-none"
            onMouseMove={handleScrubberMouseMove}
            onMouseLeave={() => {
              setHoverTime(null);
              setHoverPos(null);
            }}
          >
            {/* Scrubber Track Bar */}
            <div className="relative w-full h-1 group-hover/scrubber:h-2 bg-neutral-800 rounded-full overflow-hidden transition-all duration-150">
              {/* Torrent Downloaded Bar (on disk) */}
              {isItemDownloading && activeDownloadProgress > 0 && (
                <div
                  className="absolute left-0 top-0 bottom-0 bg-blue-500/35 transition-all duration-300"
                  style={{ width: `${Math.min(100, activeDownloadProgress)}%` }}
                />
              )}

              {/* Browser Buffered Bar (in memory) */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-white/40 transition-all duration-150"
                style={{ width: `${buffered}%` }}
              />

              {/* Playback Progress Bar */}
              <div
                className="absolute left-0 top-0 bottom-0 bg-red-600 transition-none"
                style={{ width: `${playPercent}%` }}
              />
            </div>

            {/* Scrubber Thumb Handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-red-600 rounded-full shadow-lg scale-0 group-hover/scrubber:scale-100 transition-transform pointer-events-none z-10"
              style={{ left: `${playPercent}%` }}
            />

            {/* Hover Timestamp & Buffer Preview Tooltip */}
            {hoverTime !== null && hoverPos !== null && (
              <div
                className="absolute -top-9 -translate-x-1/2 px-2.5 py-1 bg-black/90 backdrop-blur-md border border-neutral-700 rounded text-[11px] font-mono text-white shadow-xl pointer-events-none whitespace-nowrap z-30"
                style={{ left: `${hoverPos}%` }}
              >
                <span>{formatTime(hoverTime)}</span>
                {isItemDownloading && (
                  <span className="ml-1.5 text-blue-400 text-[10px]">
                    ({activeDownloadProgress}% dl)
                  </span>
                )}
              </div>
            )}

            {/* Transparent native range input over top for frictionless scrub & drag */}
            <input
              type="range"
              min={0}
              max={displayDuration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleScrubChange}
              onMouseUp={handleScrubEnd}
              onTouchEnd={handleScrubEnd}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              aria-label="Seek time"
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
                {(isVolumeHovered || isVolumeInteracting) && (
                  <div className="hidden sm:flex items-center w-20 transition-all duration-200">
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
                )}
              </div>

              {/* Time Display */}
              <div className="text-[11px] sm:text-xs md:text-sm font-mono text-neutral-300 whitespace-nowrap">
                <span>{formatTime(currentTime)}</span>
                <span className="mx-1 text-neutral-500">/</span>
                <span>{formatTime(displayDuration)}</span>
              </div>
            </div>

            {/* Center: Title on Tablet/Desktop */}
            <div className="hidden xl:block text-sm font-semibold text-neutral-300 truncate max-w-sm px-4">
              {currentTitle}
            </div>

            {/* Right: Subtitles, Cast, Restart, Next Episode, Fullscreen */}
            <div className="flex items-center space-x-2 sm:space-x-4 md:space-x-5 relative shrink-0">
              {/* Subtitles Button */}
              <button
                onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                className={`transition-colors p-1 rounded hover:text-white ${
                  selectedSubtitleId ? 'text-red-500' : 'text-neutral-300 hover:text-white'
                }`}
                title="Subtitles (C)"
              >
                <Subtitles className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              {/* Cast to Chromecast Button */}
              <div className="relative flex items-center">
                <button
                  onClick={handleCastClick}
                  className={`p-1 rounded transition-colors relative flex items-center justify-center ${
                    isCasting
                      ? 'text-red-500 hover:text-red-400'
                      : isCastConnecting
                      ? 'text-amber-400 animate-pulse'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                  title={
                    isCasting
                      ? `Casting to ${castDeviceName || 'Chromecast'} (Click to disconnect)`
                      : isCastConnecting
                      ? 'Connecting to Chromecast...'
                      : 'Cast to Chromecast'
                  }
                  aria-label="Cast to Chromecast"
                >
                  <Cast className="w-4 h-4 sm:w-5 sm:h-5" />
                  {isCasting && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-600 rounded-full animate-ping" />
                  )}
                </button>
              </div>

              {/* Restart Episode / Movie Button */}
              <button
                onClick={handleRestart}
                className="flex items-center space-x-1 sm:space-x-1.5 hover:text-white text-neutral-300 transition-colors text-xs sm:text-sm font-semibold p-1"
                title={`Restart ${activeEpisode ? 'Episode' : 'Movie'} from beginning (0 / Home)`}
              >
                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Restart</span>
              </button>

              {/* Skip Forward / Next Episode on TV shows */}
              {(item.type === 'Series' || onNextEpisode || nextEpisode) && (
                <button
                  onClick={handleNextEpisode}
                  disabled={!nextEpisode && !onNextEpisode}
                  className={`flex items-center space-x-1 sm:space-x-1.5 transition-colors text-xs sm:text-sm font-semibold p-1 ${
                    nextEpisode || onNextEpisode
                      ? 'hover:text-white text-neutral-300 cursor-pointer'
                      : 'text-neutral-600 cursor-not-allowed opacity-50'
                  }`}
                  title={nextEpisode ? `Next Episode: ${nextEpisode.name || `S${nextEpisode.seasonNumber}E${nextEpisode.episodeNumber}`}` : 'Next Episode (N)'}
                >
                  <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Next Episode</span>
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

      {/* Universal Subtitles Selection Sheet / Modal (Responsive: Mobile Bottom Sheet + Desktop Centered) */}
      {showSubtitleMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowSubtitleMenu(false)}
        >
          <div
            className="w-full sm:max-w-md bg-neutral-900 border border-neutral-800 rounded-t-2xl sm:rounded-xl p-5 space-y-4 max-h-[75vh] overflow-y-auto animate-fade-in shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
              <div className="flex items-center space-x-2 text-white font-bold text-base">
                <Subtitles size={18} className="text-red-500" />
                <span>Subtitles & Audio</span>
              </div>
              <button
                onClick={() => setShowSubtitleMenu(false)}
                className="p-1.5 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => {
                  changeSubtitleTrack(null);
                  setShowSubtitleMenu(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  selectedSubtitleId === null
                    ? 'bg-red-600/20 text-red-400 font-bold border border-red-600/40'
                    : 'text-neutral-300 hover:bg-neutral-800 border border-transparent'
                }`}
              >
                <span>Off</span>
                {selectedSubtitleId === null && <Check size={18} />}
              </button>

              {subtitles.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => {
                    changeSubtitleTrack(sub.id);
                    setShowSubtitleMenu(false);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm flex items-center justify-between transition-colors ${
                    selectedSubtitleId === sub.id
                      ? 'bg-red-600/20 text-red-400 font-bold border border-red-600/40'
                      : 'text-neutral-300 hover:bg-neutral-800 border border-transparent'
                  }`}
                >
                  <span className="truncate pr-2">{sub.title}</span>
                  {selectedSubtitleId === sub.id && <Check size={18} />}
                </button>
              ))}

              {subtitles.length === 0 && !isLoadingSubtitles && (
                <div className="text-sm text-neutral-500 py-4 text-center italic">
                  No subtitle tracks available for this title
                </div>
              )}

              {isLoadingSubtitles && (
                <div className="py-4 flex items-center justify-center space-x-2 text-neutral-400 text-sm">
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading subtitle tracks...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
