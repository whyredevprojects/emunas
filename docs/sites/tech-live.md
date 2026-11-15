# Tech plan: "Live" site (apps/live)

> **Superseded in part by `docs/sites/integration-plan.md` (2026-11-15), which wins on conflict.** Corrections that apply here: npm workspaces, not pnpm; the data stage is the shared `corpus:build` CLI writing `.corpus/`; `@hebcal/core` is build-time only (runtime `thisWeek()` reads a generated table from `packages/calendar`, no GPL code in the client); audio is served from a separate mp3-only bucket `emunas-audio` with R2 range reads returning 206 (no binding to `emunas` at all); search and feedback live in one `workers/api` Worker reached through a service binding; the player engine lives in `apps/live/app/player-engine/`; the verbatim guard reports at 12 and auto-suppresses at 20 tokens; Live's shiur pages are canonical to the Quiet site; hostname `listen.<domain>`. See integration-plan §1.4 (C1–C21).

Status: implementation plan for the concept in `docs/sites/concept-live.md`. Nothing is built yet. Figures were measured from the repository on 2026-11-15. Cloudflare limits were checked against the Cloudflare docs on the same day.

Owner boundaries: this app lives in `apps/live/`. Code meant to be shared lives in `packages/*`. Nothing here writes to `data/`, `scripts/` or `src/`. The pipeline owns those, and it keeps committing new shiurim to `data/` while this work goes on.

---

## 0. Facts this plan is built on (verified)

| Fact | Value | Where from |
|---|---|---|
| In-scope shiurim | 997 (730 yi, 267 en); categories: zman 307, set 268, parsha 199, current 79, simcha 72, shonos 49, misc 23 | `data/derived/ingest.json` `stats`, `shiurim[].inScope` |
| Done / pending | 518 done, 479 pending | `data/derived/manifest.json` `entries[].status` |
| Partial directories | `shiurim/yi-zmanim-msybs-lchyym-bkmp-01-c/` has `extraction.json` + `meta.json` but no `writeup.json`, status `pending` | directory listing |
| Series coverage | Tanya yi (63), Tanya en (42), Emunah en (28) currently have **0** done shiurim | manifest × ingest |
| Multi-recording shiurim | 4 (`yi-zmanim-svds-shvshn-pvrym-01`, `yi-zmanim-tv-bb-04`, two simcha). Evidence carries `recordingId`, and section seg indices restart per recording | `extraction.json` of `yi-zmanim-tv-bb-04` |
| Timestamps | `meta.json` `recordings[].starts/ends` (seconds per segment), `durationSec`, `noise[]`. **No transcript text in meta.json** | `meta.json` |
| Moment counts (518 done) | 5,433 sections, 3,241 insights, 985 stories, 2,386 questions, 1,763 takeaways, 3,164 key points, 15,520 source mentions | scan of extraction.json |
| Section kinds | main 4,319, intro 486, closing 354, story 177, noise 39, tangent 29, singing 16, other_speaker 11, brachah 2 | same |
| Public payload (after projection) | extraction minus `heardAs`/`asrNotes` 15.0 MB plus write-ups 8.6 MB for 518 shiurim, about 46 KB raw per shiur, so roughly **46 MB raw at completion** | measured |
| `sefariaRef` | 8,009 of 15,520 mentions have one, in Sefaria English names (`Genesis`, `Psalms`, `Shabbat`, `Rashi on Genesis`), so they can be parsed for pasuk/daf views | scan |
| Zman strings | 61 distinct values with spelling variants (`ל"ג בעומר` / `ל”ג בעומר`, `יו”כ` / `יום הכיפורים`); 56 parsha strings | ingest |
| Years | 377 shiurim have no `hebrewYears` | ingest |
| Catalog provenance | `derived`: catalog 786, filename 186, dir-prefix 25 | ingest |
| Audio | 1,129 recordings, about 12.6 GB for in-scope shiurim, private R2 bucket `emunas` (S3 endpoint, `R2_BUCKET` default `emunas`). Keys are human paths with spaces. **The same bucket holds `transcripts/…` objects** | `scripts/sync-transcripts.ts`, ingest `stats["bucket.objects"]=4556` |
| Transcripts | 1,125 files in `data/transcripts`, 63 MB, `segments: [start,end,text][]` | files |
| Verbatim overlap in derived text | Over all 518 done shiurim (38,942 generated paragraphs and items), **7** contain a run of ≥14 consecutive tokens that also appears in that shiur's ASR, and **1** a run of ≥20. At ≥10 tokens it was 27 hits in a 120-shiur sample | ad-hoc scan (§3.4) |

Cloudflare facts used: Workers static assets allow 20,000 files per version on Free and 100,000 on Paid, at most 25 MiB per file. **Static assets ignore `Range`** (they return 200 with the full file). D1 supports FTS5, including the `trigram` tokenizer. Workers AI `@cf/baai/bge-m3` is multilingual with 1,024 dims. Vectorize v2 filters on declared metadata indexes. Worker caching serves `Range` from a cached full 200 response and does not cache a Worker's own 206. R2 public buckets on a custom domain are cacheable.

Two consequences shape the design:

1. **The build never needs to read `data/transcripts`.** Every timestamp comes from `meta.json` `starts`, and every duration comes from `ingest.json`. The only code that opens transcripts is the leak guard (§3.4), which runs in CI and emits nothing that is deployed.
2. **The `emunas` bucket must never be made public**, because it holds the transcripts. Audio goes out through a Worker that can only resolve audio keys from a build-generated allowlist (§6).

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` | The repo already uses strict TS (TS 7 in root). Typecheck with the repo's `tsc` and transpile with Vite. |
| UI framework | React 19 | The app has a large amount of shared client state: a player that never stops, a queue, the command bar, and Explore facets. React has the deepest accessible-component ecosystem (React Aria). |
| App framework | React Router v7, framework mode, `ssr: false` + `prerender` | Prerenders the content routes to static HTML (needed for share previews and search engines) and hydrates into a SPA. Navigation is client-side, so the `<audio>` element and the player survive every route change, which the concept requires. The output is static and needs no server runtime. |
| Build tool | Vite (with the RR7 plugin) | Standard for RR7, with code-splitting per route. |
| Accessible primitives | `react-aria-components` | RTL-aware slider, listbox, combobox, dialog and tabs with correct keyboard behaviour in both directions. |
| State | Zustand stores for UI and player (subscribed with `useSyncExternalStore`); IndexedDB through a thin wrapper (`idb`) for persistent personal data | Small, and works outside React (the player engine and the service worker). |
| Styling | CSS Modules + global token layer (`@layer tokens, base, components, utilities`); CSS custom properties for colour, type and spacing; **logical properties only** | RTL mirroring comes free with `dir`. A stylelint rule bans physical `left/right/margin-left/padding-right/text-align:left`. No runtime CSS-in-JS. |
| Hebrew calendar | `@hebcal/core` | Parsha of the week (diaspora/Israel setting), holidays, gematriya years. Runs in the client so "this week" is always current without a rebuild. |
| Client search (light) | `minisearch` | Instant shiur-level and entity-name matching, and the offline fallback. |
| Charts/lenses | Hand-written SVG (Luach ring, Years histogram, one-hop graph) | Three small, bespoke visuals. No d3 bundle. |
| Workers | TypeScript Workers, `wrangler` ≥ 4.34 (needed for the 100k asset limit), `@cloudflare/vitest-pool-workers` for tests | |
| Package manager | pnpm workspaces (flag: npm workspaces also works, see §8) | |
| Tests | Vitest, fast-check, Playwright, `@axe-core/playwright`, Lighthouse CI | §9 |

Exact versions: pin exact versions in the scaffold task (W0), taking the newest release that is at least two weeks old. No `^` ranges in `apps/live`.

### Rendering model

- **Prerendered HTML** (at build time, from the generated JSON) for: home per UI language, each shiur page, series pages, parsha/zman occasion pages, work pages, and person/concept pages with ≥3 shiurim. These carry `<title>`, description (`summary.oneLiner` or the catalog title), OpenGraph tags and `hreflang` pairs.
- **SPA fallback** (`not_found_handling: "single-page-application"`) for everything else: long-tail entities, Explore states, search, My Shelf. Each route's `clientLoader` fetches JSON from `/data/…`.
- On hydration the prerendered page becomes the live app. All later navigation is client-side.

### Routing (UI language is the first path segment)

| Route | Prerendered | Data |
|---|---|---|
| `/` | redirect by `Accept-Language` / stored preference → `/en/` or `/yi/` (a tiny Worker rule, or a client redirect in the HTML) | |
| `/:ui/` (Today) | yes | `corpus.json`, `today.json` |
| `/:ui/s/:shiurId` (listening room); `?t=<sec>` and optional `&m=<momentId>` | yes | `shiur/<id>.json`, `writeup/<id>.<lang>.json` (lazy) |
| `/:ui/explore?…facets…&lens=list|luach|years&unit=shiurim|moments` | no | `corpus.json`, `facets.json`, `moments/<shard>.json` |
| `/:ui/seforim`, `/:ui/seforim/:workId`, `/:ui/seforim/:workId/:chapter` | shelf + works yes | `works.json`, `work/<id>.json` |
| `/:ui/maasios` | yes | `stories.json` |
| `/:ui/series`, `/:ui/series/:seriesId` | yes | `series/<id>.json` |
| `/:ui/p/:personId`, `/:ui/c/:conceptId`, `/:ui/o/:occasionId` | if ≥3 shiurim | `entity/<type>/<id>.json` |
| `/:ui/search?q=` | no | Search Worker |
| `/:ui/shelf/*` (continue, queue, playlists, saved, notes, downloads) | no | IndexedDB |
| `/:ui/pl#<encoded>` (shared playlist, no account) | no | decode client-side |

`:ui ∈ {en, yi}` sets `<html lang dir>`. Shiur-language and reading-language preferences live in client state and in the query string (`?audio=yi,en&read=en`), never in the path, so the number of prerendered pages does not multiply.

### i18n and RTL

- UI strings: typed dictionaries `apps/live/app/i18n/{en,yi}.ts` with a `t(key, params)` that fails typecheck on a missing key. Plurals use `Intl.PluralRules` (`yi` is supported). Hebrew years go through `@hebcal/core` gematriya (`תשל"ו`) with the numeric year secondary.
- Data strings: every rendered data string is wrapped in `<bdi>` or carries `dir="auto"` (component `<Text value lang>`), because catalog titles mix scripts (`The קדושה of צדיקים`). Nothing is transliterated or rewritten.
- `lang` attributes: the en text of a generated item gets `lang="en"`. The yi text gets `lang="yi"`. Catalog originals get `lang="he"` if they are Hebrew script, else `en`.
- Fonts: self-hosted woff2, subset to Hebrew + Latin: one serif for Hebrew headings and one sans for UI. `font-display: swap` with metric-matched fallbacks.
- Mirroring: the shell (rail, dock, list order, chevrons) mirrors with `dir`. The audio progress bar follows a `progressDirection` setting (default `rtl` in yi mode; this is concept decision 8) and is implemented with logical `inset-inline-start`.

---

## 2. Repository layout

```
apps/live/
  app/                         React Router app (routes/, components/, i18n/, styles/)
  app/player/                  UI bindings only; the engine is in packages/player
  build/                       site data build (Node, TS) → public/data, workers' tables, search rows
    index.ts                   orchestrates; flags: --only=static|search|vectors, --changed-since=<git sha>
    emit-static.ts             corpus/shiur/entity/series/luach/years JSON
    emit-search.ts             D1 rows (NDJSON + SQL)
    emit-vectors.ts            embedding requests and Vectorize upserts (incremental)
    neighbors.ts               "same idea elsewhere"
    budgets.ts                 size and file-count assertions
  config/
    transcript-eligibility.json   {} by default (§3.5)
    feature-flags.ts              TRANSCRIPT_VIEW = false (compile-time constant)
    publish-policy.json           category visibility, confidence threshold, suppressions
  public/                      static files (icons, fonts, manifest.webmanifest)
  public/data/                 GENERATED, gitignored
  sw/                          service worker source
  tests/                       e2e (Playwright), eval sets
  react-router.config.ts, vite.config.ts, wrangler.jsonc, package.json
workers/
  audio/                       audio Worker (shared by both sites, §6)
  search/                      search Worker (D1 + Vectorize), shared if the other site wants search
  feedback/                    feedback endpoint (D1), shared
packages/
  corpus/        SHARED. loadCorpus(), the transcript firewall, the public types, seg→seconds, moment ids
  corpus-guard/  SHARED. output scanner (forbidden keys/strings, verbatim n-gram scan)
  normalize/     SHARED. Hebrew/Yiddish text normalization, alias tables, occasion/parsha mapping, Sefaria ref parser, book names
  hebcal-map/    SHARED. catalog parsha/zman ↔ @hebcal/core events, "this week" computation
  player/        maybe shared. framework-free audio engine (timeline, chapters, skip rules, Media Session)
  i18n-core/     maybe shared. t(), plural rules, Hebrew year formatting, <Text> bidi helper (React)
  tokens/        maybe shared. design tokens as CSS custom properties
```

**Recommend sharing** (for the reconciler): `corpus` + `corpus-guard` (both sites must apply the same transcript rule. One implementation, one guard), `normalize`, `hebcal-map`, and the three Workers (one audio URL scheme, one feedback queue, one search index). `player`, `i18n-core` and `tokens` should be shared if the other site also plays audio inline or uses the same visual language. These are written framework-free so sharing costs nothing.

---

## 3. Data build

### 3.1 Inputs and what is read

The build reads only these, through `packages/corpus` `readDataFile()`, which asserts every path against an allowlist regex and throws otherwise:

| File | Used for |
|---|---|
| `data/derived/ingest.json` | All shiurim (filter `inScope`), recordings (`durationSec`, `audioKey`, `sizeBytes`), series |
| `data/derived/manifest.json` | `status`, `updatedAt` (feeds "newly summarized") |
| `data/derived/shiurim/<id>/meta.json` | `recordings[].starts`, `ends`, `durationSec`, `noise`, `asrModel`, `catalogTopics` |
| `data/derived/shiurim/<id>/extraction.json` | Summaries, sections, sources, insights, stories, questions, takeaways, concepts, people, candidateTopics (topics are not displayed, see below) |
| `data/derived/shiurim/<id>/writeup.json` | en/yi write-up |

It **never** opens `data/transcripts/**`, `**/input.txt`, `data/derived/audits/**`, `out/**`, or `data/catalog/*.pdf`. (`ingest.json` already carries the catalog fields, so `data/catalog/*.json` is not needed. If a field turns out to be missing, add `pocket-guide-2012.json` to the allowlist.) An ESLint `no-restricted-syntax` rule also bans the literals `transcripts`, `input.txt` and `audits` in `apps/live/build` and `packages/corpus`, with `packages/corpus-guard` exempt.

**Status gate.** A shiur is "full" only if the manifest says `done` **and** all three files exist and parse **and** a structural check passes (section ranges inside `starts.length`, every `recordingId` belongs to the shiur, write-up `sectionIndex` within range). Anything else, including the partial `-01-c` directory, is published as catalog-only and logged as a warning. It never fails the build: the pipeline is mid-flight by design.

### 3.2 Projection (allowlist, not strip)

`packages/corpus` defines `Public*` types and builds them **field by field** from the typed inputs. A field the pipeline adds later is therefore not published until someone maps it on purpose. The concept says "strip excluded fields"; this plan inverts it to "copy allowed fields" because that is the safer default.

Never mapped: `heardAs` (sources, concepts, people), `asrNotes`, `segs`, `startSeg/endSeg`, `questionSegs/answerSegs`, `transcriptKey`, `audioKey` (it goes only to the audio Worker table), `model`, `variant`, `promptVersion`, `asrModel` (internal; only the eligibility descriptor is public), `noise[].types`, and the validator output.

Conversions:

- `segToSec(recordingId, segIdx) = starts[segIdx]`. An item's time is the **minimum** of its evidence segs, and its end is the max seg's `ends`. Global time for multi-recording shiurim is `offset(recordingIndex) + local`, where offsets are cumulative `durationSec`. The client deals only in **global seconds** plus a `recordings[{id, offset, duration}]` table.
- Section `[start, end)` = `[starts[startSeg], starts[endSeg+1] ?? duration]`. Sections tile the recording. A property test checks they are monotonic with no gaps.
- `noise[]` segment indices become `skipRanges: [startSec, endSec][]`, merged with sections of kind `noise | singing | other_speaker`. Seconds only.
- Confidence policy from `publish-policy.json`: items under 0.6 are dropped. Items from 0.6 to 0.75 get `soft: true` (the UI softens the wording). Sources `inferred` keep a flag.
- `candidateTopics` are not published (3,873 distinct strings, mostly used once). They may feed embeddings only.

Public shiur JSON (`/data/shiur/<id>.json`, target ≤ 40 KB brotli at p95):

```ts
interface PublicShiur {
  id: string; rev: string;                 // content hash of inputs + build schema version
  lang: "yi" | "en"; category: Shiur["category"];
  catalog: { titleOriginal: string; heading?: string; subTitle?: string; sectionTitle: string;
             derived: DerivedFrom; topics: string[] };   // topics = catalogTopics (split title)
  parsha?: { raw: string; id: string }; zman?: { raw: string; occasionId: string };
  perek?: string; years: number[]; series?: { id: string; order: number; count: number };
  pathNotes: string[]; duration: number;
  recordings: { id: string; offset: number; duration: number;
                transcript: { eligible: false; quality: "budget-asr"; version: string } }[];
  status: "full" | "catalog-only";
  // present only when status === "full":
  summary?: { oneLiner: L; abstract: L; keyPoints: Moment[] };
  chapters?: { idx: number; t: number; end: number; title: L; summary: L; kind: SectionKind;
               catalogTopicIdx: number[]; soft?: true }[];
  skip?: [number, number, SectionKind | "asr-noise"][];
  sources?: { idx: number; work: string | null; workId?: string; ref: string | null;
              sefariaRef: string | null; resolution: "resolved" | "inferred" | "unresolved";
              mention: "quoted" | "paraphrased" | "alluded"; t: number }[];
  insights?: Moment[]; takeaways?: Moment[];
  questions?: { id: string; q: L; a: L; tq: number; ta: number; soft?: true }[];
  stories?: { id: string; title: L; retelling: L; people: string[]; peopleIds: string[]; t: number; end: number }[];
  people?: { name: string; id: string }[]; concepts?: { he: string; id: string }[];
  related?: { sameOccasion: string[]; otherLang?: string; neighbors: { momentId: string; shiurId: string; t: number; score: number }[] };
}
type L = { en: string; yi: string };
type Moment = { id: string; text: L; t: number; end: number; soft?: true };
```

Write-up per language, lazily loaded (`/data/writeup/<id>.<en|yi>.json`, about 9 KB raw each): `{ blocks: { sectionIndex, heading, paragraphs: { text, sourceIdx, t, end }[] }[] }`.

**Moment ids** are `<shiurId>~<kind><index>` (`s3`, `i2`, `q0`, `st1`, `tk4`, `kp0`). Indices can shift if a shiur is re-extracted, so every link also carries `t`. On a dangling `m` the client falls back to `t`.

### 3.3 Generated outputs

| Output | Content | Size target (at completion) |
|---|---|---|
| `/data/corpus.json` | One row per shiur: id, rev, lang, category, title, oneLiner (en/yi), parsha/occasion ids, years, series/order/perek, duration, status, derived flag, entity id arrays (works/people/concepts, ids only), counts (stories, questions) | ≤ 150 KB br |
| `/data/facets.json` | Facet dictionaries (id → labels en/yi/he, count) | ≤ 60 KB br |
| `/data/today.json` | Occasion → shiur ids ordered by year; "moment of the day" candidate pools per occasion; newly summarized (from `manifest.updatedAt`) | ≤ 30 KB br |
| `/data/shiur/<id>.json` ×997 | above | ≤ 40 KB br each |
| `/data/writeup/<id>.<lang>.json` ×(2×done) | above | ≤ 8 KB br each |
| `/data/series/<id>.json` ×17 | ordered parts, perek groups, one-liners | small |
| `/data/works.json`, `/data/work/<id>.json` | shelf; per work: locations sorted in the work's order (parsed `sefariaRef`), moments per location, unlocated list | ≤ 1,000 files |
| `/data/entity/{p,c,o}/<id>.json` | counts, year histogram, moments, top co-occurring entities (≥5 shared shiurim) | only entities with ≥2 shiurim get a file; the rest are inlined in `facets.json` |
| `/data/stories.json` | all stories (title, people ids, shiur, t, year) without retelling | ≤ 120 KB br |
| `/data/moments/<lang>-<n>.json` | Explore "moments" unit: id, kind, shiurId, t, title in one language, sharded by 1,000 | lazy |
| `/data/quick-index.<lang>.json` | serialized MiniSearch over titles, one-liners, section titles, entity names | ≤ 600 KB br, lazy on command-bar focus |
| `/data/build.json` | buildId, data commit sha, counts ("518 of 997 summarized"), schema version | tiny |
| `workers/audio/generated/audio-table.json` | recordingId → `{ key, size, etag? }` for in-scope recordings | ~150 KB, bundled into the audio Worker |
| `apps/live/.out/search/*.ndjson` | D1 rows (not deployed as assets) | |

**Static file budget.** At completion: about 997 shiur + about 1,000 write-up + about 3,000 entity + about 1,000 work + shards ≈ 7k data files. Prerendered HTML is 2 UI languages × (997 + about 600 entities + about 400 works + about 100 other) ≈ 4.2k. The total of about 12k fits under the 20,000 Free limit. `budgets.ts` fails the build above **18,000 files**, above **25 MiB for any file**, or on any target above.

**Caching headers** (`public/_headers`): `/assets/*` immutable (hashed). `/data/*` `Cache-Control: public, max-age=300, stale-while-revalidate=86400` with ETag. Stable paths are used for data, because content-hashed data paths would 404 in tabs left open across a deploy, given that Workers assets keep only the current version. The client compares `rev` from `corpus.json` with its IndexedDB copy to invalidate.

### 3.4 The transcript firewall and the leak guard (hard gate)

Layered so that no single mistake leaks:

1. **Read side**: the path allowlist plus the lint rule (§3.1). The build process cannot open transcript files.
2. **Shape side**: the allowlist projection (§3.2). Public types contain no field that could carry transcript text.
3. **Output guard** (`packages/corpus-guard`, run as `pnpm --filter live guard` in CI after every build and before any deploy or remote index write). It scans `public/data/**`, prerendered HTML, `.out/search/*.ndjson`, the Vectorize metadata payloads and the Worker bundles:
   - Forbidden JSON keys: `heardAs, asrNotes, segments, segs, startSeg, endSeg, questionSegs, answerSegs, transcriptKey, audioKey` (the last is allowed only in `workers/audio/generated`).
   - Forbidden substrings: `transcripts/`, `.vtt`, `input.txt`.
   - **Verbatim scan**: for each shiur, tokenize its transcript segments (Unicode letters and digits, lowercase) into **20-token shingles** and fail on any match in that shiur's output. Also report **14-token** matches to `apps/live/.out/reports/verbatim.json` (never deployed; the file contains ASR fragments, so it is a CI artifact with short retention).
   - Transcript files are allowed only at `/data/transcript/<recordingId>.json`, and only when §3.5 makes that recording eligible. With the flag off, the guard asserts the directory is absent.
4. **Remote side**: the D1 schema has no column that could hold transcript text, and the search Worker returns only generated fields (§5).

**Finding to flag:** the scan in §0 shows the generated write-ups and summaries sometimes reproduce ASR runs nearly word for word (7 items at ≥14 tokens, 1 at ≥20, across all 518 done shiurim). That is derived data the owner has approved for publication. But a 20-token verbatim run is close to a "verbatim quote" from rough ASR. Proposal: hard-fail at ≥20 tokens, with `publish-policy.json` `suppress[]` (by item id) to unpublish such an item or `allowVerbatim[]` (by item id, with a reason) to accept it. Report ≥14. **Owner decides** whether ≥14 should also suppress.

### 3.5 Transcript view: designed, OFF

- `config/feature-flags.ts`: `export const TRANSCRIPT_VIEW = false as const`. The Transcript tab component is imported behind `if (TRANSCRIPT_VIEW)` so the bundler drops it entirely.
- `config/transcript-eligibility.json`: `{ "policyVersion": 1, "eligible": {} }`. An entry is `recordingId → { model, mode, approvedBy, approvedAt, note }`.
- A recording is eligible only if the flag is on **and** it has an entry **and** the entry's `model`/`mode` equal the current transcript's (from `meta.json` `asrModel`; mode is read by the guard). A re-transcription therefore drops eligibility until someone re-approves it.
- Public descriptor on every recording: `transcript: { eligible: false, quality: "budget-asr", version: sha1(asrModel+mode) }`.
- When turned on later: a separate build step `emit-transcripts.ts` is the **only** module allowed to read `data/transcripts`, and only for eligible ids. It writes `/data/transcript/<recordingId>.json`. The guard's verbatim scan skips exactly those files.
- **Hidden search index on transcript text: NO by default.** The D1 schema reserves nothing for it. If the owner ever approves it, add a separate `transcript_fts` table used only to boost the ranks of moment ids that already exist, never as a source of `snippet()` or `highlight()`, plus a guard test asserting no API response contains a string from it. Logged as decision D1 (§11).

### 3.6 Site-owned normalization tables (stopgap)

`packages/normalize/data/*.json`, all marked `reviewStatus: "unreviewed"`:

- `occasions.json`: the 61 zman strings → canonical occasion ids (`chanukah`, `zos-chanukah`, `purim`, `purim-katan`, `lag-baomer`, `yom-kippur`, `elul`, `bein-hametzarim`, …), each with a Hebrew-calendar window for `@hebcal/core`. The build **fails on an unmapped zman string**, so new data surfaces new spellings immediately.
- `parshiyos.json`: the 56 catalog parsha strings → hebcal parsha names (including combined parshiyos).
- `works.json`: `work` strings → work id, Hebrew/English names, Sefaria index title, ordering scheme (`tanach`, `shas`, `chapter`, `none`), and `genre: true` for "Midrash", "Gemara" (not shelved).
- `people.json`, `concepts.json`: alias → canonical id. These start generated by a script (strip leading "the", case and quotes, then fold known pairs) and are then hand-edited. Unmapped strings become their own normalized id, so the build never fails on them.
- `books.json`: Sefaria English book names → Hebrew name and order, for pasuk and daf views.
- Text normalization (`normalizeHe`): strip niqqud and cantillation (U+0591–U+05C7), unify `״ ” “ "` and `׳ ’ '`, collapse whitespace, NFC. It is used for ids, the client index and FTS. Displayed text is never altered.

Recommend handing these to the pipeline as seed data for its glossary pass (concept decision 7).

### 3.7 Incremental behaviour

- The static JSON is a **full rebuild every time**. It is pure JSON transformation over at most about 150 MB of input and takes well under a minute, so there is no cache to go stale. A shiur moves from catalog-only to full on the next build with no code change.
- **Remote indexes are incremental.** Every search row and vector carries `hash = sha256(schemaVersion + normalized text + metadata)`. The loaders diff against the remote state (§5.3) and write only what changed.
- Embeddings cache: `r2://emunas-site-build/emb/<model>/<hash>.f16` (a separate private bucket, **not** `emunas`), so a rebuild re-embeds only new or changed text. Completion is about 30k moments × 2 languages × 1,024 dims × 2 B ≈ 120 MB.
- Trigger: CI on push to the data branch with `paths: ["data/derived/**", "apps/live/**", "packages/**", "workers/**"]`, and a concurrency group with cancel-in-progress (the pipeline commits several batches a day).

---

## 4. Client architecture

### 4.1 Player engine (`packages/player`, no framework)

- A single `HTMLAudioElement`, created once, outside React. The engine exposes `getState()/subscribe()` for `useSyncExternalStore`.
- **Timeline**: a shiur is `recordings[]` with offsets. Global `t` maps to (recording, local t). At a recording boundary the engine swaps `src` and continues, so 4 multi-recording shiurim play as one timeline.
- **Chapters**: `[t, end)` from `chapters`. Next/previous go by chapter, and previous restarts the current chapter if more than 3 s have played.
- **Skip rules**: `skip` ranges filtered by user settings (default: skip `noise`, `singing`, `other_speaker`, `asr-noise` ≥ 20 s). Scheduled with a timer computed from `currentTime` and `playbackRate`, re-armed on `seeking`, `ratechange` and `play`, with `timeupdate` only as a backstop. On a skip the engine emits an event and the dock shows "skipped 2:10 of singing" with an undo action.
- **Moments**: a queue item is `{ shiurId, start, end? }`. At `end` the engine pauses and offers "keep listening".
- **Media Session**: `MediaMetadata` (title = chapter title in reading language; artist = "Harav Moshe Wolfson zt"l"; album = catalog title or series), `setPositionState`. Actions: `previoustrack/nexttrack` → chapters (the car and lock-screen behaviour the concept wants), `seekbackward/seekforward` (15 s), `seekto`. `chapterInfo` is set where supported, as progressive enhancement.
- Speed (0.75–2), sleep timer (end of chapter, end of shiur, N minutes).
- Volume normalization: **deferred**. iOS ignores `element.volume`, and routing through Web Audio breaks background playback on some iOS versions. The real fix is loudness-normalized re-encodes (§6.3), which is a decision for the owner.
- Progress is written to IndexedDB every 5 s, on `pause`, and on `pagehide`.

### 4.2 Personal data (local-first)

IndexedDB stores: `progress` (shiurId → t, completed chapter idx[], completedAt), `queue`, `playlists`, `saved` (momentId + t + shiurId), `notes` (shiurId, t, text), `history`, `prefs`, `downloads`. There is a schema version and migrations. Export and import as JSON from My Shelf. That file is the user's own data and doubles as manual sync. Shared playlists: `/:ui/pl#<base64url(JSON [shiurId,t,end?][])>`, with no server.

Optional sync (later, decision D4): a `sync` Worker with a D1 table per user (`user_id, kind, key, value_json, updated_at`), last-writer-wins per key, and email magic link. Not in the first release, and the stores are designed with `updatedAt` per record so sync can be added later.

### 4.3 Explore

- `corpus.json` is loaded into a Web Worker that builds a bitset per facet value over the 997 rows. Facet counts are recomputed on each change in under 5 ms. Zero-count values are dimmed.
- Moments mode: filter shiurim with facets, then stream `moments/<lang>-<n>.json` shards, rendered in a virtualized list (`@tanstack/react-virtual`). Facets at moment level (work, person, concept) use the per-shiur entity arrays and then the item's own entity links.
- Lenses: Luach (an SVG ring of 54 parshiyos plus occasion stops on an inner ring, with `today.json` counts), Years (an SVG histogram for 5724–5780 plus an "undated (n)" lane), Connections (one-hop radial SVG from `entity/*.json` co-occurrence; edges with fewer than 5 shared shiurim are hidden).

### 4.4 Command bar

1. On focus, lazy-load `quick-index.<ui>.json` (MiniSearch) and the entity dictionary. Keystrokes give instant suggestions (entities, parsha/occasion, "Tanya 12", year), with no network.
2. On Enter, or after 250 ms of idle with ≥3 characters, call `/api/search` (§5). If that fails or the browser is offline, the bar falls back to MiniSearch results and shows "showing shiur-level results".
3. Query normalization uses `normalizeHe` plus the alias expansion from `packages/normalize`. The same code runs in the Worker.

### 4.5 Offline / PWA

- Service worker (hand-written; Workbox is optional): precache the shell; `/data/*` stale-while-revalidate with a size cap; `/audio/*` is network-only unless downloaded.
- Downloads: fetch the full mp3 (with `?dl=1`) into Cache Storage `audio-v1` and request `navigator.storage.persist()`. The SW answers `Range` requests for downloaded files by slicing the cached Blob into 206 responses, which iOS needs. The shiur and write-up JSON are pinned with the audio.
- `manifest.webmanifest` with en/yi names. The shell works offline. Search offline uses MiniSearch.

---

## 5. Search

### 5.1 Decision

- **Client-side:** shiur-level and entity-name matching (MiniSearch, ≤ 600 KB br, lazy) for suggestions and the offline fallback.
- **Server-side (Worker + D1 FTS5 + Vectorize):** moment-level lexical and semantic search. At completion there are about 30k moments with about 20 MB of bilingual text including write-up paragraphs, which is too large to ship to the browser. Semantic and cross-language matching need vectors.
- Only generated and catalog text is indexed: catalog title, heading, topics, one-liner, abstract, key points, section title + summary, insights, questions + answers, takeaways, story titles + retellings, write-up paragraphs, source `work`/`ref`, people names, `concepts.he`. **No transcript text, no `heardAs`** (decision D1 = NO).

### 5.2 D1 schema (`workers/search/migrations/0001.sql`)

```sql
CREATE TABLE moments (
  id TEXT PRIMARY KEY,            -- <shiurId>~<kind><idx>, or <shiurId>~wp<block>.<para>.<lang>
  shiur_id TEXT NOT NULL, kind TEXT NOT NULL,   -- shiur|section|insight|question|takeaway|story|keypoint|writeup
  t REAL NOT NULL, end_t REAL,
  audio_lang TEXT NOT NULL, category TEXT NOT NULL,
  occasion TEXT, series TEXT, year INTEGER,     -- first year or NULL
  catalogued INTEGER NOT NULL, confidence REAL,
  title_en TEXT, title_yi TEXT,                 -- generated display titles only
  hash TEXT NOT NULL
);
CREATE INDEX moments_shiur ON moments(shiur_id);
CREATE TABLE moment_entities (moment_id TEXT, type TEXT, entity_id TEXT, PRIMARY KEY(moment_id,type,entity_id));
CREATE INDEX me_entity ON moment_entities(type, entity_id);
-- body text per language; normalized with normalizeHe before insert
CREATE VIRTUAL TABLE fts_words USING fts5(id UNINDEXED, lang UNINDEXED, title, body,
  tokenize = "unicode61 remove_diacritics 2");
CREATE VIRTUAL TABLE fts_tri USING fts5(id UNINDEXED, lang UNINDEXED, title, body, tokenize = "trigram");
CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);   -- corpus_rev, schema_version
```

The `trigram` table exists because Hebrew and Yiddish attach prefixes to words (ב/ה/ו/כ/ל/מ/ש): `בתורה` must match `תורה`, and the word tokenizer cannot do that. Ranking combines bm25 from both tables with field weights (title > body), plus a catalogued boost and a confidence factor. This is tuned against the eval set (W23).

### 5.3 Vectorize

- Index `emunas-moments`, 1,024 dims, cosine, model `@cf/baai/bge-m3` (multilingual). Gate: before committing to it, run the eval in W14 on Yiddish queries. Alternatives are `@cf/qwen/qwen3-embedding-0.6b` (also 1,024 dims). EmbeddingGemma 2 appeared on 2026-11-12 and is too new to adopt.
- One vector per (moment, language) for sections, insights, questions, stories, takeaways, key points and the shiur abstract (about 60k vectors at completion). Write-up paragraphs are lexical-only, to save cost.
- Metadata indexes (declared): `audio_lang`, `kind`, `category`, `year`. Metadata payload: `{ shiurId, t, hash }`.
- Sync (`build/emit-vectors.ts`): for changed hashes only, embed via the Workers AI REST API with batching, upsert, and delete ids no longer present. The D1 loader likewise selects `id, hash` from `moments`, diffs, and applies batched `INSERT OR REPLACE` / `DELETE`. FTS rows go through the same diff. The final write sets `meta.corpus_rev`.

### 5.4 Search Worker API (`workers/search`)

```
GET /api/search?q=&ui=en|yi&audio=yi,en&kind=section,insight,…&category=&occasion=&series=
               &yearFrom=&yearTo=&work=&person=&concept=&mode=hybrid|lexical|semantic&limit=20&cursor=
→ 200 { rev, tookMs, results: [{ momentId, shiurId, kind, t, end, title: {en,yi}, matched: "section|insight|story|source|writeup|…",
                                  snippet?: string /* from generated text only, <mark> by offsets */, score }],
        groups: [{ shiurId, count }], next?: string }
GET /api/similar?moment=<id>&limit=10   → neighbours from Vectorize (fallback when not precomputed)
GET /api/health                         → { rev, d1: ok, vectorize: ok }
```

- Hybrid: run FTS (both tables) and Vectorize (topK 50, with metadata filter) in parallel, fuse with reciprocal-rank fusion, then group by shiur.
- Bindings: `DB` (D1 `emunas-search`), `VEC` (Vectorize), `AI` (Workers AI for the query embedding), `RATE` (Rate Limiting binding, 30 req/10 s per IP), and the cache via `caches.default` with key `q+filters+rev` and a 10 min TTL.
- Responses never include any field outside the list above. A Vitest test seeds D1 with a planted `heardAs`-like string and asserts it cannot appear in any response.

"Same idea elsewhere" is precomputed at build (`build/neighbors.ts`): brute-force cosine over cached embeddings of insights and sections (at most about 18k × 18k, chunked, under 3 min in CI). It keeps the top 5 from other shiurim above a similarity threshold, labelled as a suggestion, and writes them into `related.neighbors`. The page therefore needs no Worker for it.

---

## 6. Audio delivery

### 6.1 Audio Worker (`workers/audio`, shared)

```
GET|HEAD /audio/<recordingId>.mp3[?dl=1]
```

- `recordingId` must match `^[a-z0-9-]+$` and exist in the bundled `audio-table.json` (in-scope recordings only). Otherwise the Worker returns 404. **The Worker never accepts a key from the client**, so `transcripts/*` in the same bucket cannot be reached.
- Binding `AUDIO` → R2 bucket `emunas`, read-only in practice (the code only calls `get`/`head`).
- Response: full `200` with `Content-Type: audio/mpeg`, `Accept-Ranges: bytes`, `ETag`, `Cache-Control: public, max-age=31536000`, and with `?dl=1` a `Content-Disposition` carrying an ASCII-safe file name built from the catalog title.
- **Range strategy:** enable Workers caching for this Worker, return full 200s, and let the cache slice ranges (a 206 from the Worker itself is not cached). Fallback if caching is unavailable on the plan: pass `range: request.headers` to `R2.get` and return a 206 with `Content-Range`. That stays correct but is uncached, and R2 egress costs nothing anyway. Both paths are tested (W5). iOS Safari requires a working 206 response.
- Same origin as the site (`/audio/*` route on the site hostname, or `audio.<domain>` with CORS `GET, HEAD` and `Range` exposed) is decided by the hosting reconciler. Recommendation: a route on each site's hostname, so no CORS is needed and the player can use `crossOrigin` freely.

### 6.2 Why not a public bucket

A public custom domain on `emunas` would expose `transcripts/<path>.json`. If the owner wants CDN-native serving later, copy the audio into a **separate** bucket `emunas-audio` keyed `<recordingId>.mp3`, attach a custom domain, and point the player there. URLs stay `/audio/<id>.mp3` through a redirect or route, so clients do not change.

### 6.3 Later (owner decision)

Loudness-normalized, lower-bitrate mobile variants (for example AAC 64 kbps) built by a site-owned ops script into `emunas-audio`. Download limits, if wanted, also go in this Worker.

---

## 7. Feedback ("something's wrong here")

`workers/feedback` (shared), bindings `DB` (D1 `emunas-feedback`), `TURNSTILE_SECRET`, `RATE`.

```
POST /api/feedback  { target: { shiurId, momentId?, field?: "source|person|time|summary|other" },
                      reason: "wrong-source|wrong-name|wrong-time|misrepresents|other",
                      text?: string(≤1000), ui: "en|yi", rev: string, turnstile: string }
→ 202 { id }
GET  /admin/feedback?status=open  (Cloudflare Access protected) → JSON / CSV
```

Table `feedback(id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status)`. No IP is stored, only a salted hash for rate limiting. Reports never change the site. They are a queue for the pipeline owner.

---

## 8. Hosting and CI (for the reconciler)

- `apps/live` deploys as a Worker with static assets (`assets.directory = build/client`, `not_found_handling = "single-page-application"`). There is no Worker code in front unless the reconciler wants `/` language redirects at the edge. `/api/*` and `/audio/*` are routes to the shared Workers on the same hostname.
- Per-environment config: `preview` (every PR, separate D1/Vectorize preview resources or read-only prod) and `production`.
- Pipeline (GitHub Actions; the reconciler may swap in Workers Builds):
  1. `pnpm i --frozen-lockfile` → typecheck → unit tests
  2. `build:data` (static JSON, D1 NDJSON, audio table) → **guard** (hard gate)
  3. `vite build` (+ prerender) → budgets → Playwright smoke against `wrangler dev`
  4. On the data branch or main: apply D1 migrations → sync D1 → sync vectors → deploy Workers → deploy site
- Secrets: `CLOUDFLARE_API_TOKEN` (scoped to Workers, D1, Vectorize, Workers AI, and R2 read on `emunas-site-build`), `TURNSTILE_SECRET`. CI does not need the `emunas` R2 S3 keys, because the build never reads R2.
- Workspace note: introducing pnpm/npm workspaces touches the root `package.json` and lockfile, which the pipeline uses. Recommend a workspace file (`pnpm-workspace.yaml` listing `apps/*`, `packages/*`, `workers/*`) that leaves the pipeline's root dependencies untouched, agreed with the pipeline owner.

---

## 9. Testing

| Layer | What | Tool |
|---|---|---|
| Projection | Golden snapshots of public JSON for 6 real shiurim: yi parsha `yi-parshas-hashavua-brshys-01`, en parsha `en-parsha-en-nch-01`, yi zman `yi-zmanim-lvl-01`, multi-recording `yi-zmanim-tv-bb-04`, en misc `en-miscellaneous-en-01`, a catalog-only Tanya `yi-tanya-1-01`, plus the partial directory `yi-zmanim-msybs-lchyym-bkmp-01-c` | Vitest |
| Invariants | Chapters monotonic and tiling; every `t` within `[0, duration]`; write-up `t` inside its section; moment ids unique; multi-recording offsets | fast-check over all real shiurim |
| Firewall | A fixture with poisoned `heardAs`/`asrNotes`/an extra unknown field must not appear in the output; a fixture output containing a 20-token transcript run must fail the guard; the guard runs on the real build in CI | Vitest |
| Normalization | Every zman/parsha string in ingest is mapped (fails on new spellings); `normalizeHe` cases; Sefaria ref parser over all 8,009 refs | Vitest |
| Calendar | "This week" for fixed dates (diaspora and Israel, combined parshiyos, leap years) | Vitest |
| Player | Timeline math, skip scheduling at rates 1–2×, recording swap, moment end; a fake media element | Vitest + jsdom |
| Workers | Audio: 404 for unknown ids and for keys with `/`; HEAD; Range → 206 bytes exact; download header. Search: filter combinations, no forbidden fields, rate limit. Feedback: Turnstile failure, length caps | `@cloudflare/vitest-pool-workers` |
| E2E | Play → navigate across 5 routes → audio uninterrupted; deep link `?t=754` starts within 1 s of 754; chapter next/prev; question "hear the answer"; yi mode mirrors (screenshot diff); offline shell; catalog-only shiur plays | Playwright (Chromium, WebKit, mobile viewport) |
| Accessibility | axe on every route type in en and yi, zero serious violations; keyboard-only script through the player and command bar | `@axe-core/playwright` |
| Search quality | 60-query eval (20 en, 20 yi, 20 cross-language/transliteration) with expected shiur ids. Track recall@10 and MRR, and fail CI if they regress more than 5 points | script in `apps/live/tests/eval` |
| Performance | Lighthouse CI on Today, a shiur page and Explore (mobile profile) | LHCI |

## 10. Performance and accessibility targets

- JS: shell + player ≤ 120 KB br on first load; each route chunk ≤ 60 KB br; Explore's worker ≤ 30 KB.
- Data: per §3.3. The listening room needs at most 2 requests before first paint (HTML plus the shiur JSON is inlined in the prerendered HTML as hydration data).
- LCP ≤ 2.0 s and INP ≤ 200 ms on a mid-range phone over 4G. CLS ≤ 0.05 (the dock's height is reserved).
- Audio: `preload="none"` until intent, `preload="metadata"` on hover or touchstart of play; first sound ≤ 1.5 s after tap on a warm cache.
- Accessibility: WCAG 2.2 AA. The scrubber is an ARIA slider with `aria-valuetext` like "12 of 43 minutes, chapter 3: …"; chapter changes go to a polite live region (throttled to at most one per 10 s); keyboard shortcuts (space, ←/→ 15 s mirrored in RTL, `[` `]` chapters, `/` command bar) are disabled while typing; focus moves to the `h1` on route change; `prefers-reduced-motion` is respected; touch targets are at least 44 px. Hebrew and Yiddish strings carry `lang`. Known gap, stated in an accessibility statement: there are no captions, because transcripts are not publishable; the AI write-up is the text alternative.

---

## 11. Decisions to flag (owner or reconciler)

| # | Decision | Default in this plan |
|---|---|---|
| D1 | Transcript text or `heardAs` in a hidden search index | **NO**; no schema for it |
| D2 | Derived items with long verbatim ASR runs (§3.4): fail at ≥20 tokens; suppress at ≥14? | Fail ≥20, report ≥14 |
| D3 | Who edits `transcript-eligibility.json`, and on what evidence | Pipeline owner; flag stays `false` |
| D4 | Accounts and sync | Local-only first, export/import |
| D5 | Free downloads vs in-app offline only | In-app offline plus `?dl=1` download |
| D6 | `current` (79) and simcha (72) shiurim in general browse | Shown under their own section and excluded from Today/Explore defaults (`publish-policy.json`), pending the owner |
| D7 | Embedding model | bge-m3, gated on the Yiddish eval |
| D8 | Sefaria in-app panel vs link-out | Link-out |
| D9 | Separate public `emunas-audio` bucket and normalized re-encodes | Not now; Worker over the private bucket |
| D10 | Workspace tool and root `package.json` changes | pnpm workspace file, root deps untouched |
| D11 | Progress-bar direction in yi mode | RTL, as a user setting |

---

## 12. Work breakdown

Each task has one owner and lists its inputs and outputs. "Done when" is the acceptance test. **Fixtures first**: W1 publishes `packages/corpus/fixtures/` (the projected JSON for the 7 sample shiurim plus a 60-shiur mini corpus), so UI tasks can start before the full build exists.

**Phase A: foundations (W0 runs first; W1–W5 then run in parallel)**

| ID | Task | Inputs → outputs | Done when |
|---|---|---|---|
| W0 | Monorepo scaffold | → workspace file, `tsconfig.base.json` (strict flags §1), ESLint (with the restricted-literal rule) and stylelint (logical properties only), Vitest config, CI skeleton, `apps/live` RR7 skeleton with `/:ui/` and a hello page, `wrangler.jsonc` | `pnpm -r typecheck test build` passes in CI; the pipeline's `npm run typecheck` is unaffected |
| W1 | `packages/corpus`: loader, allowlist reader, public types, projection, seg→seconds, moment ids, status gate | `data/derived/**` → `loadCorpus(): PublicCorpus`, fixtures | Golden and property tests (§9) pass over all real shiurim; the partial directory becomes catalog-only; the 4 multi-recording shiurim have correct offsets |
| W2 | `packages/corpus-guard` | build outputs + `data/transcripts` → pass/fail + `verbatim.json` | Poisoned fixtures fail; the real build passes (or lists only the D2 items); runtime under 2 min on the full corpus |
| W3 | `packages/normalize` + `packages/hebcal-map` | ingest strings → mapping tables, `normalizeHe`, Sefaria ref parser, `thisWeek(date, israel)` | All 61 zman and 56 parsha strings mapped; all 8,009 `sefariaRef` parse or are classified; calendar tests pass |
| W4 | Static data emit (`apps/live/build/emit-static.ts`, `budgets.ts`) | W1 + W3 → `public/data/**` per §3.3 | Every file type validates against its TS type (zod schemas generated from the types); budgets pass; a rebuild after adding a new done shiur fixture changes only the expected files |
| W5 | Audio Worker + `audio-table.json` generation | ingest → Worker | Worker tests (§9) pass; a manual check against real R2 plays on iOS Safari and Android Chrome with seeking |

**Phase B: the app core (parallel after W0; uses fixtures until W4 lands)**

| ID | Task | Inputs → outputs | Done when |
|---|---|---|---|
| W6 | Shell: layout, rail, dock slot, routing, i18n/RTL, tokens, fonts, `<Text>` bidi component, language settings (UI / audio / reading) | W0 → app shell | en and yi render mirrored; axe clean; all routes stubbed; no physical CSS properties |
| W7 | `packages/player` engine + dock UI + Media Session + sleep timer + speed | fixtures → engine and React bindings | Player unit tests pass; Playwright "audio continues across navigation"; lock-screen next/prev moves by chapter (manual on iOS and Android) |
| W8 | Listening room | W6, W7, shiur JSON → page | Header, clickable catalog topics (`catalogTopicIdx`), chapters with kind behaviour, Read tab with active paragraph and seek, Sources (Sefaria link-out), Insights, Questions (hear the question / hear the answer), Stories, Related; catalog-only state; `?t=` and `&m=` deep links; AI label on every text surface; Transcript tab absent from the bundle |
| W9 | Today | W3, W6, `today.json` → page | Correct parsha and occasion for 10 fixed dates; Continue row from IndexedDB; moment of the day is deterministic per date; "newly summarized" strip |
| W10 | Personal store + My Shelf + queue/playlists | W7 → IndexedDB layer, pages | Moments queue plays across shiurim; shared playlist link round-trips; export/import; migration test |

**Phase C: browse (parallel after W4 + W6)**

| ID | Task | Inputs → outputs | Done when |
|---|---|---|---|
| W11 | Explore: facet worker, list, moments unit | `corpus.json`, `facets.json`, moment shards | Facet counts match a brute-force reference; 997-row filters under 5 ms; URL state round-trips |
| W12 | Explore lenses: Luach, Years, Connections | W11 and entity JSON | Keyboard-navigable SVG with text alternatives; undated lane count equals the number of shiurim without `hebrewYears`; edges respect the ≥5 rule |
| W13 | Series pages (Tanya by perek, side-by-side yi/en) | series JSON | All 17 series ordered by `seriesOrder`; Tanya grouped by `perek`; progress shown |
| W14a | Seforim shelf, work pages, pasuk/daf views | `works.json`, `work/*.json` | Genre-only works not shelved; Genesis view lists pesukim in order with moments; unlocated mentions listed |
| W14b | Maasios library + stories-only play mode + entity pages (person/concept/occasion) | `stories.json`, `entity/*` | Person page splits cited / in stories / discussed; stories-only queue plays back to back |
| W15 | Prerender + SEO | W4, W8, W13, W14 → HTML | `prerender()` lists the routes per §1; OG and hreflang present; sitemap; file count within budget |

**Phase D: search and similarity (W16 needs W1 + W3; the rest follow it)**

| ID | Task | Inputs → outputs | Done when |
|---|---|---|---|
| W16 | Search rows + D1 schema + incremental D1 sync | W1, W3 → `.out/search/*.ndjson`, migrations, sync script | A second run with no data change writes 0 rows; one changed shiur writes only its rows; the guard passes on the NDJSON |
| W17 | Embeddings + Vectorize sync + model eval | W16 → vectors, R2 embedding cache, eval report | The bge-m3 vs qwen3 eval on the 60 queries is recorded and a model chosen; incremental re-embed touches only changed hashes |
| W18 | Search Worker | D1, Vectorize → `/api/search`, `/api/similar` | Worker tests; p95 under 300 ms warm; responses carry only allowed fields |
| W19 | Command bar + quick index + offline fallback | W4 quick index, W18 | Suggestions with no network; full results via the API; graceful fallback; RTL input handling |
| W20 | Neighbours ("same idea elsewhere") at build | W17 cache → `related.neighbors` | Shown on the listening room, labelled as a suggestion; never from the same shiur; under 3 min in CI |

**Phase E: trust, offline, ops**

| ID | Task | Inputs → outputs | Done when |
|---|---|---|---|
| W21 | Feedback Worker + UI + admin export | → `/api/feedback`, D1 | Two-tap report from any item; Turnstile; Access-protected export |
| W22 | Service worker, PWA, downloads with SW range serving | W7, W10 | Airplane-mode playback of a downloaded shiur with seeking on iOS and Android; shell offline |
| W23 | Test infrastructure: Playwright matrix, axe, LHCI, search eval harness | all | CI runs on every PR; budgets enforced |
| W24 | CI/CD: data-triggered builds, guard gate, D1/Vectorize sync, deploys, previews | W2, W4, W16–W18 | A pipeline commit to `data/derived` produces a deploy with the new shiur full and the counter updated, with no code change |
| W25 | Transcript view scaffolding (OFF) | W1, W2 → flag, eligibility config, `emit-transcripts.ts` (never run while the flag is false), guard rule | With the flag off, the bundle contains no transcript component and no `/data/transcript` directory exists; a test build with the flag on and one fixture recording emits exactly one transcript file, and the guard accepts only that one |

**Critical path:** W0 → W1 → W4 → W8 → W15 → W24. Search (W16–W19) runs alongside it and can ship after the first release, which degrades to MiniSearch. The concept's order (§12 there) maps to: release 1 = W0–W10, W13, W15, W24; release 2 = W11, W12, W14, W16–W20; release 3 = W21, W22; W25 any time.
