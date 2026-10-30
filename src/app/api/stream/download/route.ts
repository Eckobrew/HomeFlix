import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { QBittorrentClient, isVideoFile } from '@/lib/qbittorrent';
import { getServerConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';

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
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
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
          if (fs.existsSync(directCheck) && fs.statSync(directCheck).isFile()) {
            return directCheck;
          }
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
  const fileIndexParam = searchParams.get('fileIndex');
  const fileIndex = fileIndexParam !== null ? parseInt(fileIndexParam, 10) : undefined;
  const startSec = parseFloat(searchParams.get('start') || '0');
  const forceTranscode = searchParams.get('transcode') === '1';

  if (!hash) {
    return NextResponse.json({ error: 'Missing torrent hash' }, { status: 400 });
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

  // Get file list
  const files = await client.getTorrentFiles(torrent.hash);
  let targetFile =
    fileIndex !== undefined && files[fileIndex]
      ? files[fileIndex]
      : files.filter((f) => isVideoFile(f.name)).sort((a, b) => b.size - a.size)[0];

  if (!targetFile && files.length > 0) {
    targetFile = files[0];
  }

  if (!targetFile) {
    return NextResponse.json({ error: 'No video files found in torrent' }, { status: 404 });
  }

  const config = getServerConfig();
  const downloadsPath = config.downloadsPath || '/downloads';

  const resolvedPath = findTorrentFilePath(
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

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (err) {
    return NextResponse.json({ error: 'Cannot access downloading file on disk' }, { status: 500 });
  }

  // Check initial buffer: ensure at least 10MB exists so headers/keyframes are present
  const minBuffer = 10 * 1024 * 1024;
  if (stat.size < minBuffer && targetFile.size > minBuffer && targetFile.progress < 0.01) {
    return NextResponse.json(
      {
        error: 'Buffering initial pieces. Please wait a few seconds before streaming.',
        progress: targetFile.progress,
        downloadSpeed: torrent.dlspeed,
      },
      { status: 425 }
    );
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  const isActivelyDownloading =
    targetFile.progress < 0.999 &&
    (torrent.state.toLowerCase().includes('dl') ||
      torrent.state.toLowerCase().includes('download') ||
      torrent.dlspeed > 0 ||
      torrent.progress < 1.0);

  // If download is already 100% complete and directly playable (e.g. MP4/AAC)
  const isDirectWebPlayable =
    !isActivelyDownloading &&
    !forceTranscode &&
    (ext === '.mp4' || ext === '.m4v' || ext === '.webm');

  if (isDirectWebPlayable) {
    const range = request.headers.get('range');
    const fileSize = stat.size;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const fileStream = fs.createReadStream(resolvedPath, { start, end });
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          fileStream.destroy();
        },
      });

      return new NextResponse(stream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
          'Content-Type': ext === '.webm' ? 'video/webm' : 'video/mp4',
        },
      });
    }

    const fileStream = fs.createReadStream(resolvedPath);
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        fileStream.destroy();
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': ext === '.webm' ? 'video/webm' : 'video/mp4',
      },
    });
  }

  // Transcoding / remuxing pipeline using FFmpeg
  // When file is actively downloading, we feed pipe:0 continuously so FFmpeg does not exit on EOF!
  const ffmpegArgs: string[] = ['-hide_banner', '-loglevel', 'error'];

  if (startSec > 0 && !isActivelyDownloading) {
    ffmpegArgs.push('-ss', startSec.toString());
  }

  if (isActivelyDownloading) {
    ffmpegArgs.push('-i', 'pipe:0');
  } else {
    ffmpegArgs.push('-i', resolvedPath);
  }

  // Video strategy: copy video stream directly (fastest, lossless, zero CPU)
  ffmpegArgs.push('-c:v', 'copy');

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

  let isStreamAborted = false;
  let fileFd: number | null = null;

  if (isActivelyDownloading) {
    try {
      fileFd = fs.openSync(resolvedPath, 'r');
    } catch (err) {
      console.error('[Stream] Failed to open downloading file for continuous tailing:', err);
    }

    if (fileFd !== null) {
      const fd = fileFd;
      (async () => {
        let position = 0;
        const CHUNK_SIZE = 64 * 1024;
        const buf = Buffer.alloc(CHUNK_SIZE);

        while (!isStreamAborted && !ffmpegProc.killed) {
          try {
            const bytesRead = fs.readSync(fd, buf, 0, CHUNK_SIZE, position);
            if (bytesRead > 0) {
              position += bytesRead;
              const chunk = Buffer.from(buf.subarray(0, bytesRead));
              const canWrite = ffmpegProc.stdin.write(chunk);
              if (!canWrite) {
                await new Promise((resolve) => ffmpegProc.stdin.once('drain', resolve));
              }
            } else {
              // Reached current EOF on disk!
              // Check if torrent has finished downloading
              const checkClient = new QBittorrentClient();
              const active = await checkClient.getAllActiveTorrents();
              const currTorrent = active.find((t) => t.hash.toLowerCase() === hash.toLowerCase());
              const stillDownloading = currTorrent ? currTorrent.progress < 1.0 : false;

              if (stillDownloading && !isStreamAborted && !ffmpegProc.killed) {
                // Wait 400ms for qBittorrent to download and flush more pieces to disk
                await new Promise((resolve) => setTimeout(resolve, 400));
              } else {
                // Torrent download is complete and we reached true EOF!
                break;
              }
            }
          } catch {
            break;
          }
        }

        try {
          fs.closeSync(fd);
        } catch {}
        try {
          if (!ffmpegProc.killed) {
            ffmpegProc.stdin.end();
          }
        } catch {}
      })();
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      ffmpegProc.stdout.on('data', (chunk) => {
        controller.enqueue(chunk);
      });

      ffmpegProc.stdout.on('end', () => {
        controller.close();
      });

      ffmpegProc.stdout.on('error', (err) => {
        controller.error(err);
      });

      ffmpegProc.stderr.on('data', (errData) => {
        const msg = errData.toString();
        if (!msg.includes('Output file is empty')) {
          console.warn('[FFmpeg Stream Warning]', msg);
        }
      });
    },
    cancel() {
      isStreamAborted = true;
      if (fileFd !== null) {
        try {
          fs.closeSync(fileFd);
        } catch {}
      }
      try {
        ffmpegProc.kill('SIGKILL');
      } catch {}
    },
  });

  // Handle client disconnect / aborted connection
  request.signal.addEventListener('abort', () => {
    isStreamAborted = true;
    if (fileFd !== null) {
      try {
        fs.closeSync(fileFd);
      } catch {}
    }
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
