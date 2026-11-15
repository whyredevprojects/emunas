# @emunas/audio

Public audio URLs for both sites (integration-plan Amendment A1, work package W2.8). Pure TypeScript,
no dependencies, safe in browsers, Workers and Node.

Audio is served straight from the existing `emunas` R2 bucket on its public custom domain
`media.<domain>` (CORS set on the bucket by the owner). There is no audio Worker, no `/audio/*`
route, no copy into a second bucket and no `AUDIO_ENABLED` switch.

| Export | What |
|---|---|
| `mediaUrl(audioKey, origin)` | `${origin}/${encodeURIComponent(segment)…}`: each `/`-separated segment of the bucket key is percent-encoded (spaces, `#`, `?`, Hebrew → UTF-8 octets), slashes kept, no Unicode normalisation. Throws on an invalid origin or a refused key. |
| `mediaTimeUrl(url, sec)` | `${url}#t=<floor(sec)>` media-fragment link (no-JS seek). |
| `normalizeMediaOrigin(origin)` | `https://host[:port]` only (`http` only for localhost); trailing slash dropped; anything else throws. |
| `refuseKey(key)` | Keys that never become URLs: empty, leading `/`, empty/`.`/`..` segments, backslash, control characters, or containing `transcripts/` or `.vtt`. |
| `unplayableReason(key)` / `isPlayableKey(key)` | Playability rule: only `.mp3` (any case) is playable; `.WMA` and anything else → `not-mp3`. Refused keys are unplayable too. |
| `buildAudioTable(recordings, { origin, only?, onIssue? })` | `recordingId → { canonicalId, size, playable, url }`. `duplicateOf` chains resolve to the canonical recording, whose key gives the URL. Unplayable canonical (or broken chain) → `playable: false, url: null`. Never throws on data; issues go to `onIssue`. Sorted keys. The bucket key is never copied into the table. |
| `mp3SiblingKey(key)` / `servedKey(key, transcoded)` | The `.mp3` key next to a non-mp3 object; the key to link (itself if playable, else its sibling when the original key is listed in `site-policy/audio-transcoded.json`, else null). `buildAudioTable` takes the list as `mp3Siblings` (size then 0, unknown). |
| `DEFAULT_MEDIA_ORIGIN` | `https://media.example.invalid`, the dev placeholder used when `EMUNAS_MEDIA_ORIGIN` is unset. |

`@emunas/corpus` calls `buildAudioTable` during `corpus:build`, writes `.corpus/audio-table.json`
and emits `recordings[].audioUrl` / `playable` in every `PublicShiur`. Apps read those; they do not
need this package except for `mediaTimeUrl`.

Real ingest (2026-11-15): 1,003 in-scope recordings, 1,000 playable, 3 unplayable `.WMA`
(`y-zemanim-adar-purim-02-11-purim-katan`, `…-purim-katan-5779`,
`y-zemanim-kislev-and-choref-02-22-zos-chanukah-5778`), shown as unavailable until someone
transcodes them (owner decision): `npm run transcode:wma` (scripts/transcode-wma.ts, ops-runbook §10)
uploads an MP3 next to each and lists it in `site-policy/audio-transcoded.json`.

## Tests

`npm test`: origin validation, per-segment encoding round-trips (spaces, Hebrew, `#`, `?`, `%`,
NFD), refused keys, playability, the table (duplicates → canonical URL, `.WMA` unplayable, broken
chains), and the table over the real `data/derived/ingest.json`.
