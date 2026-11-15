# Live data contract (`app/data`)

The shape of every file the Live app fetches from `/data/` (tech-live §3.3), built on the public
contract in `@emunas/corpus/public` (integration-plan §5.2). W3.6 emits files that match
`types.ts`; pages read them through `client.ts`.

| Path | Type | Loader |
|---|---|---|
| `/data/build.json` | `BuildFile` (counts, moment shard counts) | `loadBuild()` (memoized) |
| `/data/corpus.json` | `CorpusFile`: one `CorpusRow` per shiur | `loadCorpus()` (memoized) |
| `/data/facets.json` | `FacetsFile`: id → labels + count per facet | `loadFacets()` (memoized) |
| `/data/today.json` | `TodayFile`: occasion → shiurim + moment pool; newly summarized | `loadToday()` (memoized) |
| `/data/shiur/<id>.json` | `ShiurFile`: `PublicShiur` without the write-up, recordings with `audioUrl` | `loadShiur(id)` |
| `/data/writeup/<id>.<en\|yi>.json` | `WriteupFile` (one language, lazy) | `loadWriteup(id, lang)` |
| `/data/series/<id>.json` | `SeriesFile` (ordered parts, perek groups) | `loadSeries(id)` |
| `/data/works.json`, `/data/work/<key>.json` | `WorksFile`, `WorkFile` (locations, unlocated) | `loadWorks()`, `loadWork(key)` |
| `/data/entity/{p,c,o}/<key>.json` | `EntityFile` | `loadEntity(kind, key)` |
| `/data/stories.json` | `StoriesFile` (no retelling) | `loadStories()` (memoized) |
| `/data/moments/<lang>-<n>.json` | `MomentShardFile` (1,000 per shard) | `loadMomentShard(lang, n)` |
| `/data/quick-index.<lang>.json` | `QuickIndexFile` (serialized MiniSearch) | `loadQuickIndex(lang)` |

Every file has `schemaVersion === LIVE_DATA_SCHEMA_VERSION`; the client rejects anything else.
Errors are `DataError` (`status` 404 for a missing file; `notFoundToNull()` maps that to `null`).

**Audio (Amendment A1).** `ShiurFile.recordings[].audioUrl` is the media-host URL
(`${EMUNAS_MEDIA_ORIGIN}/<encoded key>`) or `null` for a recording that cannot be played (non-mp3
source): show it as unavailable. There is no `audio`/`audioKey` field and no `/audio/*` path.

**Never present** (tested on the fixtures): `heardAs`, `asrNotes`, `segs`, `startSeg`, `endSeg`,
`questionSegs`, `answerSegs`, `segments`, `transcriptKey`, `audioKey`, `asrModel`, `model`, `variant`.

## Fixtures

`fixtures/data/**` is a complete `/data/` tree derived (`fixtures/derive.ts`) from the golden projected
shiurim of `@emunas/corpus` (7 shiurim: full and catalog-only, Yiddish and English, a 2-recording
shiur, a Tanya series part). `fixtures/fixtures.test.ts` fails when the committed tree is stale;
regenerate with

```sh
UPDATE_LIVE_FIXTURES=1 npx vitest run app/data/fixtures   # from apps/live
```

Use them:

- in unit tests: `configureData({ fetch: fixtureFetch })` (from `fixtures/fetch.ts`);
- in the browser while developing: `VITE_LIVE_DATA=fixtures npm run dev -w @emunas/live` (dev only;
  the branch and the fixture chunks are dropped from production builds);
- in Playwright: `test/e2e/serve.js` serves `/data/*` from the fixtures when the build has none.

Fixture media URLs point at `https://media.example.invalid/`.
