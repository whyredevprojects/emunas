# Live static data emit (`apps/live/data-build`, W3.6)

Turns `.corpus/` into the `/data/*` files of the Live data contract (`app/data/types.ts`, tech-live
§3.3) under `apps/live/public/data/` (gitignored), which `react-router build` copies into
`build/client/data/`. The integration plan names this package `apps/live/build/**`, but `build/` is
React Router's output directory (gitignored), so the source lives here.

```sh
npm run corpus:build                                  # repo root: data/ → .corpus/ (+ guard pre-pass, --suppress)
npm run data:build -w @emunas/live                    # .corpus/ → apps/live/public/data/ (validated; --policy site-policy)
npm run data:budgets -w @emunas/live                  # file counts and sizes (after `build`, also build/client)
npx tsx data-build/cli.ts validate                    # from apps/live: every file against its schema
```

Deploy order (integration-plan §4): `corpus:build` → guard pre-pass → `corpus:build --suppress` →
`data:build` → `react-router build` → guard post-pass over `build/client` → `data:budgets`.

## Inputs

Only `.corpus/`: `build.json`, `index.json`, `shiurim/<id>.json`, the W2.1 aggregates (`sections`,
`neighbours`, `series`, `occasions`, `years`, `works`, `people`, `concepts`, `stories`, `entities`),
`updated.json` (manifest `updatedAt` of the full shiurim, added to `corpus:build` for "newly
summarized") and the corpus layer `.corpus/layer/` (C1.2; `layer-input.ts`). Search documents come
from `@emunas/search-core` (`buildSearchDoc`; the quick index's entity names come from its
`EntityDoc` labels). Nothing here reads `data/`, and nothing reads the corpus raw folder: no alias
map, no ASR variant, no synonym is published or indexed. The only other input is the `featured`
part of `site-policy/corpus-policy.json` (D7, `--policy`).

## The corpus layer (C1.7, corpus-wave-plan §3, §4)

`emit-corpus.ts` turns the layer into the files below, field by field. Entity ids are corpus ids.
Live lists (facets, entity files, links) a person only with a Live page (≥3 shiurim, never type
`other`, never excluded), a concept with a Live page (not merged into a topic), a sefer with a Live
page (never generic) and every topic with visible shiurim; the rules are `app/data/live-pages.ts`,
shared with the prerender list. A page file exists exactly when its page flag is set. Everything
there is AI-generated and unreviewed; `reviewed` is carried so pages can show the label once.

**Loading (plan §4).** Today renders from `today.json` alone (compact cards for every shiur it
names, occasion rows of `TODAY_ROW_PER_LANG` shiurim per language with the total, the occasion mix's
first sections); the listening room from its shiur file alone (related titles, series title and the
corpus refs with labels). Neither requests `corpus.json`, `facets.json` or any corpus-wide file;
`corpus.json` is for Explore, search and the shelf. Pairing across languages is gone (F.1): no
`sibling` on series or series facets, no counterpart in the room.

## Outputs

| File | From |
|---|---|
| `build.json` | corpus `build.json` counts and data sha; `buildId` = hash(corpus buildId, emitter version, schema version); moment shard counts |
| `corpus.json` | `index.json` rows; `entities` are the shiur's Live-listed corpus ids (works, people, concepts) |
| `facets.json` | labels and row counts for every category, language, occasion (tables, the "other" bucket and file-name guesses), year, series, and the Live-listed works, people and concepts (corpus ids, layer labels) |
| `today.json` | the corpus counter; `occasions.json` (parshiyos, zmanim with their sub-headings, "other"): a row of up to 3 shiurim per language by year with the total, a pool of at most 4 timed insights/stories/questions from the row, the label where it differs from the shared tables, and the occasion mix (occasion-topics of the layer; D7 filters); `newlySummarized`: the 12 newest by manifest `updatedAt`; a compact card for every shiur named (one-liners only on the newly summarized) |
| `shiur/<id>.json` | the projected shiur without the write-up; `related` from `neighbours.json` (prev/next in series order, else catalog section order) with the `titles` of every shiur named; `neighbors` from `neighbors.ts` (W4.4, below); `seriesTitle`; `corpus`: topics with salience, section topic chips, labels, terms, sources' work ids, story counts and thread marks with page flags (G.1) |
| `writeup/<id>.<en\|yi>.json` | the write-up blocks, full shiurim only |
| `series/<id>.json` | `series.json` parts and perek groups; `synthesis` (overview, key themes, arc one-liners for visible parts) when the layer has one |
| `works.json`, `work/<id>.json` | Live-page works by corpus id, in the layer's shelf order; each cited source goes to the work its moment resolves to, locations in the work's order |
| `entity/{p,c,o}/<key>.json` | people and concepts with a Live page (corpus ids), occasions with ≥2 shiurim: shiurim by year, year histogram, moments (the tellings of a person's stories, a concept's example sections, an occasion's insights/stories/questions), up to 12 entities sharing ≥5 shiurim |
| `stories.json` | `stories.json` without retellings; `peopleKeys` are the merged story's Live-listed person ids (kept for the current Maasios page until C2.7) |
| `moments/<lang>-<n>.json` | every timed item of every full shiur, 1,000 per shard, catalog order |
| `quick-index.<lang>.json` | serialized MiniSearch (`fields` title, occasion, oneLiner, sections, entities; stores `name`). `entities` holds the EntityDoc labels of the shiur's Live-listed works, people and concepts (no aliases). Values are folded with search-core's `foldForIndex`; the client searches `normalizeQuery(q).tokens` |
| `topics.json` | the topic tree as rows `[id, parentId, en, yi, he, count]`, parents first (`topicNodes()` expands them) |
| `topic/<id>.json`, `topic/<id>.moments-<n>.json` | description, term, hubs as cards, children, co-topics, threads and stories (with page flags), the first 30 mix sections with titles; further sections 300 per page, ids and times only; mix totals per audio language; the first 40 rows of "all shiurim" (grade, salience, year; a `touched` row carries its first tagged section) |
| `topic-shiurim/<id>.<n>.json` | further "all shiurim" rows of a topic, 200 per page |
| `thread/<id>.json` | threads with a page (≥3 shiurim): label, summary, topics, members by year with the per-shiur insight |
| `story/<id>.json` | stories with a page (≥2 tellings): title, retelling, people (linked or plain names), `attributionVaries` (the tellings credit it to different people), tellings with the chapter each sits in |
| `stories-index.json` | every merged story without retellings: title, Live-listed people ids, telling count, languages, page flag, first telling |
| `glossary/<prefix>.json` | glossary cards by id prefix (`build.json` `glossaryShards`; `glossaryShardFor`), split until each fits 6 KiB br |
| `explore/entities.json` | per summarized shiur: topic, person, concept, work ids (Explore's facets; `corpus.json` keeps the last three until C3.1) |

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
- brotli (quality 5) targets: corpus 150 KiB, facets 90 KiB, today 30 KiB, shiur 40 KiB, write-up
  8 KiB, stories 120 KiB, quick index 600 KiB; corpus layer (plan §4): topic tree 8 KiB, topic file
  and moment page 24 KiB, thread and story 6 KiB, stories index 120 KiB, glossary shard 8 KiB. The
  shiur file's growth (≤ 2 KiB br at the median) is checked by `real-data.test.ts`.

The prerender projection counts topics, threads (≥3 shiurim) and stories (≥2 tellings) by the
layer's Live page flags (`prerenderSetsFromCorpus` reads them, occasions still from
`entities.json`); topic moment pages are data, not routes.

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
- `emit-corpus.test.ts`: the corpus-layer files: strict schemas, page flag ⇔ file, every link
  target with a page flag has a file, no layer prose in corpus/facets/today/shiur files, glossary
  shards, Explore ids, no alias/ASR/pairing key, the featured mix and its D7 filters.
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
