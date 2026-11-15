# Live static data emit (`apps/live/data-build`, W3.6)

Turns `.corpus/` into the `/data/*` files of the Live data contract (`app/data/types.ts`, tech-live
§3.3) under `apps/live/public/data/` (gitignored), which `react-router build` copies into
`build/client/data/`. The integration plan names this package `apps/live/build/**`, but `build/` is
React Router's output directory (gitignored), so the source lives here.

```sh
npm run corpus:build                                  # repo root: data/ → .corpus/ (+ guard pre-pass, --suppress)
npm run data:build -w @emunas/live                    # .corpus/ → apps/live/public/data/ (validated)
npm run data:budgets -w @emunas/live                  # file counts and sizes (after `build`, also build/client)
npx tsx data-build/cli.ts validate                    # from apps/live: every file against its schema
```

Deploy order (integration-plan §4): `corpus:build` → guard pre-pass → `corpus:build --suppress` →
`data:build` → `react-router build` → guard post-pass over `build/client` → `data:budgets`.

## Inputs

Only `.corpus/`: `build.json`, `index.json`, `shiurim/<id>.json`, the W2.1 aggregates (`sections`,
`neighbours`, `series`, `occasions`, `years`, `works`, `people`, `concepts`, `stories`, `entities`)
and `updated.json` (manifest `updatedAt` of the full shiurim, added to `corpus:build` for "newly
summarized"). Search documents come from `@emunas/search-core` (`buildSearchDoc`, without
`candidateTopics`). Nothing here reads `data/`.

## Outputs

| File | From |
|---|---|
| `build.json` | corpus `build.json` counts and data sha; `buildId` = hash(corpus buildId, emitter version, schema version); moment shard counts |
| `corpus.json` | `index.json` rows. `entities.concepts` keeps browse concepts only (≥2 shiurim, not stop-listed) |
| `facets.json` | labels and row counts for every category, language, occasion (tables, the "other" bucket and file-name guesses), year, series, work, person and browse concept used in `corpus.json` |
| `today.json` | `occasions.json` (parshiyos, zmanim with their sub-headings, "other"): shiurim by year and a pool of at most 12 timed insights/stories/questions per occasion, round-robin over the shiurim; `newlySummarized`: the 24 newest by manifest `updatedAt` |
| `shiur/<id>.json` | the projected shiur without the write-up; `related` from `neighbours.json` (prev/next in series order, else catalog section order); `neighbors` from `neighbors.ts` (W4.4, below) |
| `writeup/<id>.<en\|yi>.json` | the write-up blocks, full shiurim only |
| `series/<id>.json` | `series.json` parts and perek groups |
| `works.json`, `work/<key>.json` | `works.json`: shelf without the generic labels (`genre`); one file per cited work, locations in the work's order |
| `entity/{p,c,o}/<key>.json` | people, browse concepts and occasions with ≥2 shiurim: shiurim by year, year histogram, moments (a person's stories, a concept's chapters, an occasion's insights/stories/questions), up to 12 entities sharing ≥5 shiurim |
| `stories.json` | `stories.json` without retellings |
| `moments/<lang>-<n>.json` | every timed item of every full shiur, 1,000 per shard, catalog order |
| `quick-index.<lang>.json` | serialized MiniSearch (`fields` title, occasion, oneLiner, sections, entities; stores `name`). Values are folded with search-core's `foldForIndex`; the client searches `normalizeQuery(q).tokens` |

Every file is validated against a valibot schema before anything is written (`schemas.ts`). The
schemas are strict (an unknown key fails) and are checked at compile time to infer exactly the
contract types, so a contract change that is not mirrored there fails `tsc`. Files are written only
when their bytes change; files no longer emitted are removed.

## "Same idea elsewhere" (`neighbors.ts`, W4.4)

Before the emit, `data:build` computes `related.neighbors` for every summarized shiur: up to 5
moments, each from a different *other* shiur, whose cosine similarity to one of this shiur's
sections or insights is at or above a threshold, best first. Never a moment of the same shiur.
Shiurim in the other language are candidates like any other: a Yiddish and an English shiur on the
same perek or parsha are separate shiurim, not translations of each other.
The listening room shows them under "Same idea elsewhere", labelled as a suggestion.

- **Units**: the `section` and `insight` moment rows (`buildMomentRows` of `@emunas/search-core`),
  with exactly the texts the W3.10 Vectorize sync embeds (`toVectorUnits` in
  `workers/api/sync/src/rows.ts`), so cache keys match. Generated text only; the output holds ids,
  times and scores.
- **Vectors** (`--neighbors auto|embeddings|lexical|off`, default `auto`):
  - `embeddings`: the W3.10 cache `emb/<model>/<sha256(text)>.f16` in a folder (`--embeddings <dir>`
    or `EMUNAS_EMBED_CACHE`; model `--embed-model` or `EMUNAS_EMBED_MODEL`, default
    `@cf/baai/bge-m3`). A moment's vector is the normalized mean of its per-language vectors.
    Nothing is embedded here; moments whose texts are not cached are left out and counted.
  - `lexical`: deterministic fallback with no model or account: TF-IDF over `foldTokens` of the
    same texts, feature-hashed into 1,024 dimensions (shared rare words; English and Yiddish both
    count because every moment carries both languages).
  - `auto`: the cache when one is given and covers ≥95% of moments, else lexical (logged).
- **Thresholds**: lexical 0.3; embeddings 0.75 (a starting value for bge-m3, not yet calibrated:
  see below). `--neighbor-threshold` overrides.
- **Search**: brute force over all pairs, rows in groups of four, split over worker threads
  (`--neighbor-workers`, default all cores up to 8). Every pair is scored once by the same code
  whatever the split; ties break on sorted ids; scores are rounded to 3 decimals. An unchanged corpus
  and cache give byte-identical files. The lists' sha256 is folded into `build.json` `buildId`.
- **Time**: today (8,674 moments, lexical, 4 cores) about 11 s. At the plan's ceiling, 18,000
  moments × 1,024 dims, about 40 s on 4 cores (~80 s on 2); `neighbors.test.ts` asserts the
  projection stays under 3 minutes.

### Plugging in the real embeddings (needs Cloudflare credentials; not done here)

1. Run the W3.10 eval and sync (`workers/api/sync/README.md`), which fill R2 `emunas-site-build`
   with `emb/<model>/*.f16` for every section and insight text.
2. In the deploy job, mirror that model's prefix to a local folder before `data:build`, e.g. with
   the R2 S3 endpoint and the sync's derived credentials:

   ```sh
   aws s3 sync --endpoint-url "https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com" \
     s3://emunas-site-build/emb/baai--bge-m3/ .cache/embeddings/emb/baai--bge-m3/
   npm run data:build -w @emunas/live -- --neighbors embeddings --embeddings .cache/embeddings
   ```

   (keep `.cache/embeddings` in `actions/cache` so only new blobs are fetched). Programmatically,
   `buildNeighbors` takes any `BlobReader`, so the sync's `R2S3Store` can be passed directly.
   Use `--neighbors embeddings` in CI so a missing cache fails loudly instead of silently falling
   back.
3. Locally the embeddings path can be exercised without an account: `npx tsx workers/api/sync/src/cli.ts --only vectors`
   fills `workers/api/.wrangler/state/emunas-sync/cache` with the sync's deterministic stand-in
   vectors; then `npm run data:build -w @emunas/live -- --neighbors embeddings --embeddings
   workers/api/.wrangler/state/emunas-sync/cache --embed-model fake/hashing-trigram-1024
   --neighbor-threshold 0.5` (full coverage, ~10 s, identical output with any worker count).
4. Calibrate the threshold once on the real vectors: look at the score distribution of the lists
   (median and the 20 lowest pairs) and set `NEIGHBOR_DEFAULTS.threshold.embeddings` so loose pairs
   drop out; if qwen3 wins the eval, pass `--embed-model @cf/qwen/qwen3-embedding-0.6b`.

## Budgets (`budgets.ts`)

- at most 18,000 files: `build/client` after the app build; before it, data files + other public
  files + the projected prerender + `APP_BUILD_FILES` (120: JS/CSS chunks, the SPA fallback,
  `robots.txt`, `sw.js`). The prerender projection follows W4.5's `prerenderPaths` exactly: per UI
  language Today, every shiur and series with a file, occasions with ≥2 shiurim, and the works,
  people and concepts with `livePrerender` in `.corpus/entities.json` (`--corpus`, default
  `<repo>/.corpus`; without it every work and entity file counts, an upper bound). On the real data
  that is 4,570 pages, the number the build writes;
- at most 25 MiB per file; at most 1,000 work files;
- brotli (quality 5) targets: corpus 150 KiB, facets 60 KiB, today 30 KiB, shiur 40 KiB, write-up
  8 KiB, stories 120 KiB, quick index 600 KiB.

`corpus.json` is a soft target: with the W2.4 contract every row carries both one-liners, so the
file is about 205 KiB br at 518 summarized shiurim and will be about 330 KiB at 997. It is reported
as a warning and fails above 400 KiB. Meeting 150 KiB needs a contract change (for example one-liners
in a separate per-language file).

On today's data (518 of 997 summarized): 4,243 data files, 8,936 files projected (8,910 in
`build/client` after the build), largest shiur 18.6 KiB br, largest write-up 6.3 KiB br, facets 52 KiB, today 16 KiB,
stories 54 KiB, quick index 255 KiB per language.

## Tests

`npm test -w @emunas/live` runs them after the app tests (`vitest.config.ts` here):

- `emit.test.ts`: the mini corpus: schema validation, completeness, facets/entities/today/series/
  works/moments consistency, the quick index through MiniSearch and `normalizeQuery`, no forbidden
  keys or substrings (and the corpus-guard scanner), determinism, the validator rejecting unknown
  keys and wrong types, the committed fixtures validating.
- `icons.test.ts`: the committed PNG icons (sizes, opaque full-bleed variants, transparent corners on
  `any`), the manifest's icon list, the mark inside the maskable safe zone.
- `incremental.test.ts`: a shiur flips from pending to done; only the expected files change and all
  others keep their bytes and mtimes.
- `real-data.test.ts`: the deploy order on the repo's data, with the guard pre-pass and the verbatim
  post-pass over the emitted tree (about 45 s); budgets pass.
- `budgets.test.ts`: each budget check fires; the CLI end to end.
- `neighbors.test.ts`: the kernel against a naive O(n²) reference (one thread and several), never a
  same-shiur neighbour, one moment per other shiur, threshold and cap, tie-breaks independent of the
  worker split, the cache reader on the W3.10 layout, the `auto` fallback, the emit wiring on the
  mini corpus (schema-valid, real target moments and times, deterministic, build id), and the
  3-minute budget projected to 18,000 × 1,024.

## App icons (`icons.ts`)

`npx tsx data-build/icons.ts` (from apps/live) renders `public/icons/icon.svg` to the PNG icons the
manifest and iOS need, through headless Chrome (`playwright-core`; system Chrome by default,
`PW_CHANNEL=chromium` for Playwright's): `icon-192.png` and `icon-512.png` (`any`, transparent
corners), `icon-maskable-192.png` and `icon-maskable-512.png` (full-bleed square, the mark inside the
safe zone) and `apple-touch-icon.png` (180 × 180, opaque). The outputs are committed; rerun after
changing the SVG.

## Contract fixtures

`app/data/fixtures/data/**` is this emitter's output over the `@emunas/corpus` mini corpus (with the
lexical neighbours), regenerated by `UPDATE_LIVE_FIXTURES=1 npx vitest run app/data/fixtures`; the
test there fails when the committed tree is stale.
