# @emunas/audio

Audio for both sites (integration-plan §3.2, C12–C15, work package W1.5).

| Import | What | Runtime |
|---|---|---|
| `@emunas/audio` | everything edge-safe below | browser / Workers / Node |
| `@emunas/audio/paths` | `audioPath(id)`, `downloadPath(id)`, `audioTimePath(id, sec)`, `parseAudioPath`, `isAudioId` | any |
| `@emunas/audio/table` | `buildAudioTable(recordings)` → `audio-table.json`, `lookupAudio` | any |
| `@emunas/audio/handler` | `handleAudio(request, env, table)` | Workers |
| `@emunas/audio/publish` | publish plan, executor, CLI | Node (AWS SDK) |

## URL scheme

`/audio/<recordingId>.mp3`, same origin on each site host. `?download=1` (alias `?dl=1`) →
`Content-Disposition: attachment; filename="<ASCII catalog title>.mp3"` (falls back to the id when
the title has no Latin letters). Ids match `^[a-z0-9-]+$`.

## Audio table

`buildAudioTable(recs)` takes the corpus's in-scope recordings (`{ id, sizeBytes, duplicateOf,
audioKey?, title? }`; the pipeline `Recording` fits) and returns
`{ [recordingId]: { size, canonicalId, title? } }`, sorted. Duplicates map to their canonical
recording. Rows that can never be served (bad id, broken duplicate chain, non-mp3 source key,
bad size) are left out and reported through `onIssue`; the build never fails on them. `audioKey`
is only read to drop non-mp3 sources and is never copied into the table.

## Edge handler

`handleAudio(request, { AUDIO, AUDIO_ENABLED }, table)`:

- `GET|HEAD` only (else 405). `AUDIO_ENABLED` must be `"true"` (or `true`), else 503 HTML.
- Path must be exactly `/audio/<id>.mp3` with a valid id that is in the table, else 404 (no R2 call).
  The R2 key is `<canonicalId>.mp3` from the table; nothing from the client reaches R2 as a key.
- GET: `AUDIO.get(key, { range, onlyIf: request.headers })` → 200 / 206 (`Content-Range`) /
  304 / 412 / 416. Single ranges `bytes=a-b`, `bytes=a-`, `bytes=-n`; multi-range or malformed
  ranges get the full 200. `If-Range` is honoured.
- HEAD: `AUDIO.head(key)`, conditionals and range evaluated in the handler.
- Headers: `Accept-Ranges`, `ETag`, `Last-Modified`, `Content-Length`, `Content-Type: audio/mpeg`,
  `Cache-Control: public, max-age=604800`, `X-Content-Type-Options: nosniff`. Errors are `no-store`.

`AUDIO` is the `emunas-audio` bucket. Site Workers never bind the private `emunas` bucket.

## Publish CLI

```sh
npm run audio:publish --workspace=@emunas/audio -- --dry-run          # plan only, no credentials
npm run audio:publish --workspace=@emunas/audio -- --check-extraneous # copy, then list strays
```

Reads `data/derived/ingest.json` (override with `--ingest`). A recording is in scope when an
in-scope shiur lists it; only canonical recordings (`duplicateOf === null`, plus the canonical of
any in-scope duplicate) are copied, server-side (`CopyObject`, `CopySourceIfMatch`), from
`emunas/<audioKey>` to `emunas-audio/<id>.mp3` with `Content-Type: audio/mpeg`, the cache header
and the source ETag in metadata. An existing object with the same size and the same ETag (or
recorded source ETag) is skipped, so reruns copy 0. Keys that do not end in `.mp3`
(case-insensitive), start with `transcripts/`, or contain `..`/control characters are refused, in
the plan and again at execution. There is no flag to pass a key.

Credentials: `R2_AUDIO_SRC_{ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY}` and
`R2_AUDIO_DST_{…}` (each falls back to `R2_{…}`); buckets `R2_AUDIO_SRC_BUCKET` /
`R2_AUDIO_DST_BUCKET` or `--src-bucket` / `--dst-bucket`. R2 runs `CopyObject` with the
destination credentials, so that key also needs read access to `emunas`.

Real ingest (2026-11-15): 997 in-scope shiurim → 1,003 in-scope recordings, all with
`duplicateOf === null`; 1,000 to copy (11.70 GiB); 3 refused because the source is `.WMA`
(`y-zemanim-adar-purim-02-11-purim-katan`, `…-purim-katan-5779`,
`y-zemanim-kislev-and-choref-02-22-zos-chanukah-5778`). Those three are also left out of the
audio table, so their `/audio/` URLs 404 until someone transcodes them (owner decision).

## Tests

- `npm run test:node`: URL scheme, filenames, key rules, table, range/conditional logic, publish
  plan + executor + CLI against a mocked S3, and the dry run on the real ingest.
- `npm run test:workers`: the handler inside workerd with a local R2 bucket
  (`@cloudflare/vitest-plugin`, the renamed `@cloudflare/vitest-pool-workers`): `bytes=0-`,
  `bytes=100-199`, `bytes=-500`, 416, `If-None-Match` 304, `If-Match` 412, `If-Range`, HEAD,
  unknown id / `/` / `..` 404, disabled 503, download header.
