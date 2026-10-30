import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';

const token = 'integration-test-token-not-for-real-use-123456789';
const dir = await mkdtemp(join(tmpdir(), 'homestream-mobile-'));
const port = Number(process.env.MOBILE_TEST_PORT || 3197);
const origin = `http://127.0.0.1:${port}`;
let output = '';
let server;
const jellyfinCalls = [];
const jellyfin = createServer(async (request, response) => {
  let text = '';
  for await (const chunk of request) text += chunk;
  jellyfinCalls.push({ path: request.url, body: text ? JSON.parse(text) : null });
  response.setHeader('Content-Type', 'application/json');
  if (request.url.startsWith('/Items/episode/PlaybackInfo')) {
    response.end(JSON.stringify({ PlaySessionId: 'session', MediaSources: [{
      Id: 'source', RunTimeTicks: 36000000000,
      TranscodingUrl: '/Videos/episode/master.m3u8?api_key=fake-stream-key',
    }] }));
  } else if (request.url.startsWith('/Sessions/Playing/')) {
    response.end('{}');
  } else {
    response.statusCode = 404; response.end('{}');
  }
});
async function start(secret) {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    env: { ...process.env, DATA_DIR: dir, HOMESTREAM_MOBILE_TOKEN: secret,
      JELLYFIN_URL: '', NEXT_PUBLIC_JELLYFIN_URL: '', JELLYFIN_API_KEY: '',
      SEERR_URL: '', NEXT_PUBLIC_SEERR_URL: '', SEERR_API_KEY: '',
      QBITTORRENT_URL: '', NEXT_PUBLIC_QBITTORRENT_URL: '', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  for (let i = 0; i < 120; i++) {
    try { await fetch(`${origin}/api/mobile/v1/capabilities`); return; } catch {}
    if (server.exitCode != null) throw Error(output);
    await delay(500);
  }
  throw Error('Server startup timed out');
}
async function stop() {
  if (!server || server.exitCode != null) return;
  const exited = once(server, 'exit'); server.kill('SIGTERM'); await exited;
}
async function api(path, expectedStatus = 200, body, auth = token) {
  const response = await fetch(`${origin}/api/mobile/v1/${path}`, {
    headers: { Authorization: `Bearer ${auth}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, expectedStatus, `${path}: ${JSON.stringify(result)}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return result;
}
try {
  await start('');
  await api('capabilities', 503);
  await stop();
  await start(token);
  await api('capabilities', 401, undefined, 'wrong-token');
  await api('capabilities', 401, undefined, '');
  assert.equal((await api('capabilities')).apiVersion, 1);
  assert.ok(Array.isArray((await api('profiles')).profiles));
  const home = await api('home');
  assert.equal(home.isDemoMode, true);
  assert.ok(home.sections.length > 0);
  const id = home.hero.id;
  assert.equal((await api(`media/${id}`)).item.id, id);
  assert.ok(Array.isArray((await api('library/movies')).items));
  assert.ok(Array.isArray((await api('library/tv')).items));
  await api('playback', 400);
  await api('playback?itemId=example&startTimeTicks=-1', 400);
  await api('playback?itemId=example&startTimeTicks=NaN', 400);
  await api('playback?itemId=example', 503);
  const malformed = await fetch(`${origin}/api/mobile/v1/progress`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: 'not-json' });
  assert.equal(malformed.status, 400);
  const rawAuth = await fetch(`${origin}/api/mobile/v1/capabilities`, { headers: { Authorization: token } });
  assert.equal(rawAuth.status, 401);
  await api('progress', 400, { itemId: 'example', positionTicks: -1 });
  await api('progress', 400, { itemId: 'example', positionTicks: '1' });
  await api('progress', 400, { positionTicks: 0 });
  await api('not-found', 404);
  await api('config', 404);
  // A fake upstream verifies real Jellyfin negotiation and profile mapping without
  // touching a household server or relying solely on demo responses.
  jellyfin.listen(0, '127.0.0.1'); await once(jellyfin, 'listening');
  const jellyfinUrl = `http://127.0.0.1:${jellyfin.address().port}`;
  await writeFile(join(dir, 'config.json'), JSON.stringify({ jellyfinUrl, jellyfinApiKey: 'fake-server-key', jellyfinUserId: 'default-user' }));
  await writeFile(join(dir, 'profiles.json'), JSON.stringify([{ id: 'household-profile', name: 'Test', jellyfinUserId: 'linked-jellyfin-user' }]));
  const stream = await api('playback?itemId=episode&userId=household-profile&forceTranscode=true');
  assert.equal(stream.isTranscoding, true);
  assert.equal(stream.streamUrl, `${jellyfinUrl}/Videos/episode/master.m3u8?api_key=fake-stream-key`);
  const negotiation = jellyfinCalls.find(call => call.path.startsWith('/Items/episode/PlaybackInfo'));
  assert.ok(negotiation.path.includes('UserId=linked-jellyfin-user'));
  assert.deepEqual(negotiation.body.DeviceProfile.DirectPlayProfiles, []);
  assert.equal(negotiation.body.DeviceProfile.TranscodingProfiles[0].VideoCodec, 'h264');
  await api('progress', 200, { itemId: 'episode', userId: 'household-profile', positionTicks: 1234560000, isPaused: true });
  const progress = jellyfinCalls.find(call => call.path === '/Sessions/Playing/Progress');
  assert.equal(progress.body.UserId, 'linked-jellyfin-user');
  assert.equal(progress.body.PositionTicks, 1234560000);
  await api('progress', 200, { itemId: 'episode', userId: 'household-profile', positionTicks: 1234560000, isStopped: true });
  assert.ok(jellyfinCalls.some(call => call.path === '/Sessions/Playing/Stopped'));
  console.log('Mobile API integration checks passed (auth, feed, profiles, details, libraries, validation, Jellyfin negotiation, profile-linked progress and stop).');
} catch (error) {
  console.error(output.slice(-6000)); throw error;
} finally {
  await stop();
  if (jellyfin.listening) await new Promise(resolve => jellyfin.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
