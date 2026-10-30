import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const token = 'integration-test-token-not-for-real-use-123456789';
const dir = await mkdtemp(join(tmpdir(), 'homestream-mobile-'));
const port = Number(process.env.MOBILE_TEST_PORT || 3197);
const origin = `http://127.0.0.1:${port}`;
let output = '';
let server;
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
  console.log('Mobile API integration checks passed (auth, feed, profiles, details, libraries, validation, endpoint isolation).');
} catch (error) {
  console.error(output.slice(-6000)); throw error;
} finally {
  await stop(); await rm(dir, { recursive: true, force: true });
}
