import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { QBittorrentClient, isVideoFile } from '@/lib/qbittorrent';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

function confinedFile(root: string, candidate: string): string | null {
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(candidate);
    const relative = path.relative(realRoot, realFile);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.statSync(realFile).isFile()) return null;
    return realFile;
  } catch { return null; }
}

function findTorrentFilePath(
  downloadsPath: string,
  contentPath: string,
  torrentName: string,
  fileName: string
): string | null {
  const candidates: string[] = [];

  if (contentPath) {
    candidates.push(contentPath);
    // If contentPath was relative or inside another container mount
    const baseContentName = path.basename(contentPath);
    candidates.push(path.join(downloadsPath, baseContentName));
  }

  if (fileName) {
    candidates.push(path.join(downloadsPath, fileName));
    candidates.push(path.join(downloadsPath, torrentName, fileName));
    candidates.push(path.join(downloadsPath, path.basename(fileName)));
  }

  if (torrentName) {
    candidates.push(path.join(downloadsPath, torrentName));
  }

  for (const p of candidates) {
    try {
      const file = confinedFile(downloadsPath, p);
      if (file) return file;
    } catch {
      // Ignore permission or traversal errors during candidate check
    }
  }

  // Recursive search 1 level down in downloadsPath
  try {
    if (fs.existsSync(downloadsPath)) {
      const topDirs = fs.readdirSync(downloadsPath, { withFileTypes: true });
      for (const ent of topDirs) {
        if (ent.isDirectory()) {
          const directCheck = path.join(downloadsPath, ent.name, path.basename(fileName));
          const file = confinedFile(downloadsPath, directCheck);
          if (file) return file;
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get('hash');
  const rawPath = searchParams.get('path');
  const fileIndexParam = searchParams.get('fileIndex');
  const fileIndex = fileIndexParam !== null ? parseInt(fileIndexParam, 10) : undefined;
  const seasonParam = searchParams.get('season');
  const episodeParam = searchParams.get('episode');
  const startSec = parseFloat(searchParams.get('start') || '0');
  const forceTranscode = searchParams.get('transcode') === '1';

  if (!Number.isFinite(startSec) || startSec < 0 ||
      (fileIndexParam !== null && (!/^\d+$/.test(fileIndexParam) || !Number.isSafeInteger(fileIndex))) ||
      [seasonParam, episodeParam].some(value => value !== null && (!/^\d+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))))) {
    return NextResponse.json({ error: 'Invalid stream parameters' }, { status: 400 });
  }
  const config = getServerConfig();
  const downloadsPath = config.downloadsPath || '/downloads';

  let resolvedPath: string | null = null;
  let isActivelyDownloading = false;
  let targetFileSize = 0;
  let targetFileProgress = 1.0;

  // 1. Synthetic testing or direct path streaming
  if (rawPath) {
    const candidate = path.resolve(downloadsPath, rawPath);
    const safePath = confinedFile(downloadsPath, candidate);
    if (!safePath) return NextResponse.json({ error: 'Invalid or unavailable file path' }, { status: 403 });
    resolvedPath = safePath;
    isActivelyDownloading = searchParams.get('growing') === '1';
    targetFileSize = fs.statSync(safePath).size;
    targetFileProgress = isActivelyDownloading ? 0.5 : 1.0;
  } else {
    // 2. Standard torrent hash streaming
    if (!hash) {
      return NextResponse.json({ error: 'Missing torrent hash or path' }, { status: 400 });
    }

    const client = new QBittorrentClient();
    if (!client.isConfigured()) {
      return NextResponse.json({ error: 'qBittorrent is not configured' }, { status: 503 });
    }

    // Fetch torrent info
    const rawList = await client.getAllActiveTorrents();
    const torrent = rawList.find((t) => t.hash.toLowerCase() === hash.toLowerCase());

    if (!torrent) {
      return NextResponse.json({ error: 'Torrent not found' }, { status: 404 });
    }

    // Ensure sequential downloading & first/last piece priority are enabled
    if (!torrent.seq_dl || !torrent.f_l_piece_prio) {
      await client.ensureSequentialAndHeader(torrent.hash, torrent.seq_dl, torrent.f_l_piece_prio);
    }

    // Get file list (handling season packs and multi-file torrents)
    const files = await client.getTorrentFiles(torrent.hash);
    let targetFile = fileIndex !== undefined && files[fileIndex] ? files[fileIndex] : undefined;

    // If season and episode are specified, find matching episode file in season pack
    if (!targetFile && (seasonParam || episodeParam)) {
      const sNum = seasonParam ? parseInt(seasonParam, 10) : 1;
      const epNum = episodeParam ? parseInt(episodeParam, 10) : 1;
      const patterns = [
        new RegExp(`s0*${sNum}[._ -]*e0*${epNum}\\b`, 'i'),
        new RegExp(`\\b${sNum}x0*${epNum}\\b`, 'i'),
        new RegExp(`\\be0*${epNum}\\b`, 'i'),
        new RegExp(`[._ -]0*${epNum}[._ -]`, 'i'),
      ];
      for (const pattern of patterns) {
        const found = files.find((f) => isVideoFile(f.name) && pattern.test(f.name));
        if (found) {
          targetFile = found;
          break;
        }
      }
    }

    if (!targetFile && (seasonParam || episodeParam || fileIndexParam !== null)) {
      return NextResponse.json({ error: 'Requested video file not found in torrent' }, { status: 404 });
    }

    // Default: earliest episode if TV season pack, otherwise largest video file
    if (!targetFile) {
      const videoFiles = files.filter((f) => isVideoFile(f.name));
      targetFile = videoFiles.sort((a, b) => {
        const s1 = a.name.match(/s(\d+)e(\d+)/i);
        const s2 = b.name.match(/s(\d+)e(\d+)/i);
        if (s1 && s2) {
          const sDiff = parseInt(s1[1], 10) - parseInt(s2[1], 10);
          if (sDiff !== 0) return sDiff;
          return parseInt(s1[2], 10) - parseInt(s2[2], 10);
        }
        return b.size - a.size;
      })[0];
    }

    if (!targetFile && files.length > 0) {
      targetFile = files[0];
    }

    if (!targetFile) {
      return NextResponse.json({ error: 'No video files found in torrent' }, { status: 404 });
    }

    // Prioritize downloading this specific file (season pack optimization!)
    client.prioritizeFile(torrent.hash, targetFile.index).catch(() => {});

    resolvedPath = findTorrentFilePath(
      downloadsPath,
      torrent.content_path,
      torrent.name,
      targetFile.name
    );

    if (!resolvedPath) {
      return NextResponse.json(
        {
          error: `Torrent file not found in downloads volume (${downloadsPath}). Check your volume mount settings.`,
          torrentName: torrent.name,
          fileName: targetFile.name,
        },
        { status: 404 }
      );
    }

    targetFileSize = targetFile.size;
    targetFileProgress = targetFile.progress;
    isActivelyDownloading =
      targetFile.progress < 0.999 &&
      (torrent.state.toLowerCase().includes('dl') ||
        torrent.state.toLowerCase().includes('download') ||
        torrent.dlspeed > 0 ||
        torrent.progress < 1.0);
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (err) {
    return NextResponse.json({ error: 'Cannot access downloading file on disk' }, { status: 500 });
  }

  // Quick probe support: return durationSeconds measured directly by ffprobe
  if (searchParams.get('probe') === '1') {
    try {
      const probeProc = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        resolvedPath,
      ]);
      let out = '';
      probeProc.stdout.on('data', (d) => { out += d.toString(); });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { probeProc.kill('SIGKILL'); reject(new Error('Probe timed out')); }, 10000);
        probeProc.once('error', error => { clearTimeout(timeout); reject(error); });
        probeProc.once('close', () => { clearTimeout(timeout); resolve(); });
      });
      const dur = parseFloat(out.trim());
      if (dur > 0) {
        return NextResponse.json({ durationSeconds: dur });
      }
    } catch {}
    return NextResponse.json({ durationSeconds: 0 });
  }

  // Check initial buffer: ensure at least 10MB exists so headers/keyframes are present
  const minBuffer = 10 * 1024 * 1024;
  if (stat.size < minBuffer && targetFileSize > minBuffer && targetFileProgress < 0.01) {
    return NextResponse.json(
      {
        error: 'Buffering initial pieces. Please wait a few seconds before streaming.',
        progress: targetFileProgress,
      },
      { status: 425 }
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();

  // If download is already 100% complete and directly playable (e.g. MP4/AAC)
  const isDirectWebPlayable =
    !isActivelyDownloading &&
    !forceTranscode &&
    (ext === '.mp4' || ext === '.m4v' || ext === '.webm');

  if (isDirectWebPlayable) {
    const range = request.headers.get('range');
    const fileSize = stat.size;

    let start = 0;
    let end = fileSize - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
      if (!match[1]) start = Math.max(0, fileSize - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(Number(match[2]), fileSize - 1);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= fileSize) {
        return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${fileSize}` } });
      }
    }
    const fileStream = fs.createReadStream(resolvedPath, fileSize ? { start, end } : {});
    const abort = () => { fileStream.destroy(); };
    request.signal.addEventListener('abort', abort, { once: true });
    fileStream.once('close', () => request.signal.removeEventListener('abort', abort));
    return new NextResponse(Readable.toWeb(fileStream) as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${fileSize}` } : {}),
        'Accept-Ranges': 'bytes',
        'Content-Length': String(fileSize ? end - start + 1 : 0),
        'Content-Type': ext === '.webm' ? 'video/webm' : 'video/mp4',
        'Cache-Control': 'no-store',
      },
    });
  }

  // Transcoding / remuxing pipeline using FFmpeg
  // Read directly from file on disk so FFmpeg can parse container clusters & seek reliably without pipe EPIPE crashes
  const ffmpegArgs: string[] = ['-hide_banner', '-loglevel', 'error'];

  if (startSec > 0) {
    ffmpegArgs.push('-ss', startSec.toString());
  }

  ffmpegArgs.push('-i', resolvedPath);

  // Video strategy: copy video stream directly (fastest, lossless, zero CPU)
  if (forceTranscode) ffmpegArgs.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p');
  else ffmpegArgs.push('-c:v', 'copy');

  // Audio strategy: transcode audio to standard stereo AAC for universal browser playback
  ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');

  // Output format: Fragmented MP4 (fMP4) playable live without moov header at end
  ffmpegArgs.push(
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  );

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs);

  const stream = new ReadableStream({
    start(controller) {
      ffmpegProc.once('error', error => { try { controller.error(error); } catch {} });
      ffmpegProc.stdout.on('data', (chunk) => {
        try {
          controller.enqueue(chunk);
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            ffmpegProc.stdout.pause();
          }
        } catch {
          // Controller might already be closed
        }
      });

      ffmpegProc.stdout.on('end', () => {
        try {
          controller.close();
        } catch {}
      });

      ffmpegProc.stdout.on('error', (err) => {
        try {
          controller.error(err);
        } catch {}
      });

      ffmpegProc.stderr.on('data', (errData) => {
        const msg = errData.toString();
        if (!msg.includes('Output file is empty')) {
          console.warn('[FFmpeg Stream Warning]', msg);
        }
      });
    },
    pull() {
      if (ffmpegProc.stdout.isPaused()) {
        ffmpegProc.stdout.resume();
      }
    },
    cancel() {
      try {
        ffmpegProc.kill('SIGKILL');
      } catch {}
    },
  });

  // Handle client disconnect / aborted connection
  request.signal.addEventListener('abort', () => {
    try {
      ffmpegProc.kill('SIGKILL');
    } catch {}
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Connection: 'keep-alive',
    },
  });
}
