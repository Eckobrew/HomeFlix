# Backend audit fixes and client integration — 2026-10-31

This checkout accompanies HomeStream Android 1.1.0 and incorporates the newer
`origin/feat/mobile-api` features found on the live deployment, including image
proxying, registered device tokens, Seerr enrichment and movie collections. Changes have been prepared
locally; nothing has been pushed, deployed or restarted on the hosted instance.
Deployment context: Proxmox `192.168.1.172`, LXC `111`, HomeStream
`192.168.1.198:3000`. Read-only SSH checks verified the service and integration
configuration. No live credentials, watch history, container or configuration
was modified.

## Security and migration

- Existing locally paired device tokens remain valid; old remote-login device
  tokens must sign in again to obtain a profile-bound account token. Registered
  token lookup rejects prototype properties such as `__proto__`, and account
  sessions cannot mint household device tokens.
- Web login cookies are signed, expire after 30 days, and reject tampering and
  legacy unsigned cookies. Existing web users must sign in again.
- Set `HOMESTREAM_SESSION_SECRET` to a random value of at least 32 characters.
  The mobile household token is used as the signing secret when a separate
  session secret is absent. Generate secrets with `openssl rand -hex 32`.
- Web API routes enforce authentication on the server. Configuration changes
  and profile management require an administrator or a trusted local request.
  The login interface is not the authorization boundary.
- Requests without a verifiable client IP require authentication. Forwarded IP
  headers are ignored unless `HOMESTREAM_TRUST_PROXY=true`. Enable this only
  behind a reverse proxy that removes client-supplied forwarding headers and
  supplies the actual client IP. Hostnames, Tailscale-looking headers, proxy hops
  and a hardcoded/discovered WAN address no longer grant unauthenticated access.
- For initial setup before Jellyfin login is available, configure integrations
  through environment variables or set a separate `HOMESTREAM_SETUP_TOKEN` of
  at least 32 characters. Authenticated setup API requests may send that token as
  `Authorization: Bearer <setup-token>`. Do not distribute it to native clients.
- Mobile household tokens retain household profile access. Jellyfin account
  login returns a signed token bound to the logged-in user's history. Web and
  mobile account sessions use that user's Jellyfin access token for upstream
  media operations, rather than exposing the configured server administrator key.
- Web login pickers only expose Jellyfin's public users. Login attempts are
  bounded per client address; sessions and login responses must be served over
  HTTPS outside trusted LANs. In-memory rate limiting is per server process.
- State-changing web requests reject mismatched Origin headers. Private API
  responses are not cached. Collection metadata currently returns `null` when
  unavailable; this is not a fabricated empty collection.
- Download paths are confined using real paths, preventing sibling-prefix and
  symlink escapes. Byte ranges support suffixes, clamp valid ends, reject invalid
  requests with 416, and stream with backpressure. Missing episode files fail
  explicitly rather than falling back to an unrelated file. FFmpeg spawn errors
  and ffprobe timeouts are handled.
- Next.js was upgraded from 14.2.35 to 15.5.28 with React 19 and asynchronous
  request/route APIs. PostCSS is overridden to a patched 8.5.32 throughout the
  dependency tree. The production dependency audit is checked independently of
  legacy development-tool warnings.

For Sonarr/Radarr webhooks, use a trusted private request through the configured
proxy or a separately scoped webhook token as documented in `.env.example`.

## Android API contracts and playback

Authenticated `/api/mobile/v1` now exposes search (actual Jellyfin libraries plus
Seerr discovery), categories, downloads, recommendations and download streams.
Public `discovery` returns only basic protocol/server metadata; selecting a
server still requires a household pairing token. New device-token registration requires existing household credentials; anonymous
local pairing is not provided. `auth/login` supports Jellyfin credentials; `auth/users` deliberately
returns no private account list.

`GET episodes?itemId=…` supplies playable episodes in season/episode order, skips
missing files, and avoids mixing specials into a regular-season queue.
`POST watched` accepts `{itemId, played, userId}`. Account sessions override
client-supplied profile IDs. Library options and watched badges are available in
the web catalog and Android client. Android prepares receiver-side episode
queues and supports previous/next, subtitle selection and local handoff.

Web playback now advances at the end of an episode. The player uses its fetched
episode list rather than an always-present parent callback that could do nothing.
Cast completion observed by the web player also advances when autoplay is on;
this requires the web player to remain open. Android's prepared receiver queue
can continue without its player screen. Playback-start events are now reported by Android before progress events.
Neither client adds a background history reporting service. Physical Cast and lip-sync tests remain necessary.

## Checks

- `npm run test:mobile`: isolated integration checks using fake Jellyfin and
  temporary files; no household watch history or production requests are changed.
- `npm run build`: production compilation, type checking and route generation.
- Targeted ESLint on new authentication/security modules and the mobile route.
- `npm audit --omit=dev`: production dependency security check.
- Full `npm run lint` still reports legacy explicit-any and existing React/style
  issues outside the new security modules; those have not been suppressed.

The integration suite covers forged/invalid cookies, untrusted forwarding
headers, protected routes, login/profile binding, per-user upstream credentials,
episode ordering, watched updates, playback negotiation, progress/stop, range
responses and path/symlink confinement. The running LXC and recent upstream transcode logs were inspected read-only.
The updated build has not been installed on a physical Chromecast or deployed
to the LXC; audio sync is not yet confirmed fixed.

## Cast audio investigation

The old Android client forces HLS for all Cast sessions. Auto mode now negotiates
a receiver-specific H.264/AAC profile and preserves supported direct playback;
HLS compatibility mode requests stereo AAC. No global audio offset is applied.
Recent upstream logs showed copied 5.1 AAC with transcoded video, but those logs
could not be conclusively matched to the currently casting scene. Compare the
new Auto and HLS modes on the affected Chromecast with Google TV.

## Automatic capability negotiation

Android reports MediaCodec video/audio decoders and the web player checks the
browser’s playable codecs. The backend compares these with Jellyfin’s source
information and prefers direct play, then direct stream/remux, then compatible
conversion. Cast uses receiver model limits where identifiable and actual load/
decode errors where capability information is incomplete. A failed source gets
a compatible retry; future supported sources may still direct play. An optional
device override handles generic model names. Google TV HD profiles allow HEVC
with 1920×1080 limits; generic receivers are probed automatically.

Source codecs and server conversion reasons are exposed independently of HLS
transport. Default subtitle burn-in is disabled during negotiation because
clients request external subtitle tracks separately. `npm run test:playback`
checks browser capability reporting. The production integration test also checks
remux preference, reported codecs, HD constraints and compatibility-mode audio.

Registered local-device tokens predate signed account sessions. Revocation of
those tokens is managed through the server device registry; rotating the shared
mobile token alone does not revoke every registered device token. Old remote
login tokens must reauthenticate to receive profile-bound sessions.

Final checks: production build, standalone production integration suite, browser
capability tests and targeted lint all passed. `npm audit --omit=dev` reported
zero known production vulnerabilities. Legacy full-repository lint issues and
18 moderate development-tool dependency advisories remain. The live deployment
has a household secret below the new 32-character minimum; rollout must provision
a new strong household secret and session signing secret while preserving the
existing device registry (two registered local devices were observed).
