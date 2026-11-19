# Live service worker, PWA and offline downloads (`sw/`, W4.8)

tech-live §4.5 and integration-plan §8 W4.8, as amended by A1 (audio lives on the media host
`media.<domain>`, CORS enabled; no `/audio/*` route).

| Path | What |
|---|---|
| `src/sw.ts` | worker entry (events only), built to `/sw.js` |
| `src/handler.ts` | routing and caching, against injected `caches`/`fetch` (unit-tested in Node) |
| `src/range.ts` | `Range` → `206` from a cached Blob (iOS needs it to play and seek) |
| `src/precache.ts` | which build files form the offline shell |
| `src/protocol.ts` | cache names, data-cache cap, page → worker messages |
| `build.ts` | `tsx sw/build.ts`: precache list + version hash, Vite bundle into `build/client/sw.js` (runs in `npm run build`) |
| `client/register.ts` | registers `/sw.js` (production only), reconciles downloads on load |
| `client/downloads.ts` | download / remove / reconcile a shiur; records through the personal store's `putDownload` |
| `client/DownloadButton.tsx` | the room's "Download for offline" control (en/yi/he strings in `client/strings.ts`) |
| `../public/manifest.webmanifest` | web app manifest (en, with `translations.yi` and `translations.he` blocks) |

## Caching

| Request | Strategy | Cache |
|---|---|---|
| navigation | network; offline → precached page for the path, else the SPA fallback (`/__spa-fallback`, a build-time copy of `index.html`) | `shell-<hash>` |
| shell files (`/assets/*`, icons, manifest, `/<ui>/` for every UI language, SPA fallback) | precached, cache first | `shell-<hash>` |
| `/data/*` | stale-while-revalidate, capped at 300 entries (oldest out); pinned copy as last resort | `data-v1`, `pinned-v1` |
| media-host audio, not downloaded | **not intercepted** (no `respondWith`): network-only, CDN Range as usual | — |
| media-host audio, downloaded | from cache; `Range` → `206`, none → `200`, out of range → `416` | `audio-v1` |

A new build has a new shell hash; the new worker waits until old tabs close (no `skipWaiting`, so an
open tab keeps its lazy chunks), then deletes old shell caches. `audio-v1`, `pinned-v1` and `data-v1`
survive deploys.

## Downloads

`downloadShiur(shiur)` runs in the page (a worker event would be killed during a long mp3 fetch):

1. `planDownload`: every `playable` recording's `audioUrl` in order (`playable: false` recordings have
   no URL and are never downloaded; a shiur with none cannot be downloaded), plus
   `/data/shiur/<id>.json` and `/data/writeup/<id>.<lang>.json` for each write-up language.
2. `navigator.storage.persist()`, then `putDownload({state: "partial"})`.
3. JSON into `pinned-v1`; each recording `fetch(audioUrl, {mode: "cors", credentials: "omit"})`
   (only a full `200` is stored) streamed into `audio-v1` under that exact URL, with progress.
4. Tells the worker `downloads-changed` (it reloads its set of downloaded URLs), then
   `putDownload({state: "complete"})`. On failure the record stays `partial`; a retry resumes.

`removeShiurDownload` keeps audio that another downloaded shiur shares (duplicate recordings have
the canonical URL). `reconcileDownloads` runs on every load and fixes records after eviction.

The media bucket's CORS rules must allow the Live origins (W3.11); CSP `connect-src` already names the
media origin (`public/_headers`).

## Tests

- `npm test -w @emunas/live` includes `vitest run --config sw/vitest.config.ts` (in-memory Cache Storage).
- `test/e2e/offline.spec.ts` (Playwright): the shell loads offline; a downloaded shiur opens offline,
  the worker answers Range with 206, and the real player starts at `?t=120` and seeks both ways.
- Manual (not automatable here): airplane-mode playback with seeking of a downloaded shiur on iOS
  Safari and Android Chrome.
