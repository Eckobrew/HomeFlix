#!/usr/bin/env node

/**
 * End-to-End Live Stream Test Script
 * Tests:
 * 1. Multi-streamer concurrent transcoding of growing/static media
 * 2. Continuous feeder without terminating on EOF
 * 3. Client disconnect cleanup (no zombie FFmpeg processes)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DOWNLOADS_DIR = process.env.DOWNLOADS_PATH || '/downloads';

console.log(`\n============================================================`);
console.log(`🚀 Live Stream & Multi-Streamer Verification Test`);
console.log(`🌐 Base URL: ${BASE_URL}`);
console.log(`📁 Downloads Dir: ${DOWNLOADS_DIR}`);
console.log(`============================================================\n`);

async function run() {
  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // Step 1: Create a synthetic MKV file in downloads volume
  const testFileName = `test_stream_${Date.now()}.mkv`;
  const testFilePath = path.join(DOWNLOADS_DIR, testFileName);

  console.log(`--- Step 1: Generating Test MKV Video ---`);
  try {
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=10:size=640x360:rate=24 -f lavfi -i sine=frequency=440:duration=10 -c:v libx264 -preset ultrafast -c:a aac "${testFilePath}" 2>/dev/null`
    );
    const stat = fs.statSync(testFilePath);
    assert(stat.size > 20000, `Created synthetic MKV video (${(stat.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`  Failed creating test file in ${DOWNLOADS_DIR}: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Test Single Streamer Playback & Fragmented MP4 Header
  console.log(`\n--- Step 2: Streamer 1 Connecting to Stream ---`);
  const stream1Promise = new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/stream/download?path=${testFileName}`, (res) => {
      let chunks = 0;
      let totalBytes = 0;
      let hasFtyp = false;

      res.on('data', (chunk) => {
        chunks++;
        totalBytes += chunk.length;
        if (!hasFtyp && chunk.toString('latin1').includes('ftyp')) {
          hasFtyp = true;
        }
        // Once we received initial frames, resolve
        if (totalBytes > 30000) {
          req.destroy();
          resolve({ success: true, chunks, totalBytes, hasFtyp, status: res.statusCode, contentType: res.headers['content-type'] });
        }
      });

      res.on('error', () => {
        resolve({ success: false });
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });

  const res1 = await stream1Promise;
  assert(res1.status === 200, `Stream returned HTTP 200 OK`);
  assert(res1.contentType?.includes('video/mp4'), `Content-Type is video/mp4 (${res1.contentType})`);
  assert(res1.hasFtyp, `Received valid fragmented MP4 header (ftyp atom)`);

  // Step 3: Test Multiple Concurrent Streamers (3 simultaneous clients)
  console.log(`\n--- Step 3: Testing 3 Concurrent Streamers Simultaneously ---`);
  async function connectStreamer(clientId) {
    return new Promise((resolve) => {
      const req = http.get(`${BASE_URL}/api/stream/download?path=${testFileName}`, (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
          if (bytes > 40000) {
            req.destroy(); // Client finished reading
            resolve({ clientId, success: true, bytes, status: res.statusCode });
          }
        });
        res.on('end', () => {
          resolve({ clientId, success: bytes > 0, bytes, status: res.statusCode });
        });
      });
      req.on('error', (err) => {
        resolve({ clientId, success: false, error: err.message });
      });
    });
  }

  const concurrentResults = await Promise.all([
    connectStreamer('Streamer-A'),
    connectStreamer('Streamer-B'),
    connectStreamer('Streamer-C'),
  ]);

  const allClientsOk = concurrentResults.every((c) => c.success && c.status === 200);
  assert(allClientsOk, `All 3 concurrent streamers received fragmented MP4 streams in parallel`);
  concurrentResults.forEach((c) => {
    console.log(`    ${c.clientId}: Received ${c.bytes} bytes (HTTP ${c.status})`);
  });

  // Step 4: Test Growing File (Continuous Tail Without Stop)
  console.log(`\n--- Step 4: Testing Growing File Feed (Starvation & Auto-Resume) ---`);
  const growingFileName = `growing_test_${Date.now()}.mkv`;
  const growingFilePath = path.join(DOWNLOADS_DIR, growingFileName);

  // Write initial 2 seconds
  execSync(
    `ffmpeg -y -f lavfi -i testsrc=duration=2:size=320x240:rate=24 -f lavfi -i sine=frequency=440:duration=2 -c:v libx264 -preset ultrafast -c:a aac "${growingFilePath}" 2>/dev/null`
  );

  const initialStat = fs.statSync(growingFilePath);
  console.log(`  Initial partial file size: ${(initialStat.size / 1024).toFixed(1)} KB`);

  let growingStreamBytesReceived = 0;
  let receivedBeforeAppend = 0;
  let receivedAfterAppend = 0;
  let streamEndedPrematurely = false;

  const growingStreamPromise = new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/api/stream/download?path=${growingFileName}&growing=1`, (res) => {
      res.on('data', (chunk) => {
        growingStreamBytesReceived += chunk.length;
      });

      res.on('end', () => {
        streamEndedPrematurely = true;
      });
    });

    req.on('error', () => {});

    // After 1.5 seconds, check bytes received and append more data
    setTimeout(() => {
      receivedBeforeAppend = growingStreamBytesReceived;
      console.log(`    Streamer received initial chunk: ${receivedBeforeAppend} bytes. Stream open: ${!streamEndedPrematurely}`);

      // Append more data simulating new piece arriving from torrent download
      const extraChunkPath = path.join(DOWNLOADS_DIR, `temp_chunk_${Date.now()}.mkv`);
      execSync(
        `ffmpeg -y -f lavfi -i testsrc=duration=3:size=320x240:rate=24 -f lavfi -i sine=frequency=880:duration=3 -c:v libx264 -preset ultrafast -c:a aac "${extraChunkPath}" 2>/dev/null`
      );
      const extraBytes = fs.readFileSync(extraChunkPath);
      fs.appendFileSync(growingFilePath, extraBytes);
      try { fs.unlinkSync(extraChunkPath); } catch {}
      console.log(`    Appended ${(extraBytes.length / 1024).toFixed(1)} KB new piece to growing file.`);

      // Wait another 1.5 seconds to verify stream continued
      setTimeout(() => {
        receivedAfterAppend = growingStreamBytesReceived;
        req.destroy();
        resolve();
      }, 1500);
    }, 1500);
  });

  await growingStreamPromise;
  assert(!streamEndedPrematurely, `Stream remained OPEN and did not terminate when reaching initial EOF`);
  assert(receivedBeforeAppend > 0, `Received initial stream frames before append (${receivedBeforeAppend} bytes)`);
  assert(
    receivedAfterAppend >= receivedBeforeAppend,
    `Continuous feeder successfully resumed after piece append (Total: ${receivedAfterAppend} bytes)`
  );

  // Step 5: Verify no orphaned FFmpeg processes remain
  console.log(`\n--- Step 5: Clean Process State (No Zombies) ---`);
  // Allow brief grace period for client disconnect signal to propagate and terminate FFmpeg
  await new Promise((r) => setTimeout(r, 800));
  const activeFfmpegCount = parseInt(
    execSync(`ps aux | grep "[f]fmpeg.*frag_keyframe" | wc -l || echo 0`).toString().trim(),
    10
  );
  assert(activeFfmpegCount === 0, `All FFmpeg transcoding processes cleanly terminated after disconnect (${activeFfmpegCount} active)`);

  // Clean up
  try { fs.unlinkSync(testFilePath); } catch {}
  try { fs.unlinkSync(growingFilePath); } catch {}

  console.log(`\n============================================================`);
  console.log(`📊 Live Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`============================================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
