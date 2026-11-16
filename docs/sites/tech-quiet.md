# Technical plan — Concept A "Quiet" (the catalog as a sefer)

> **Superseded in part by `docs/sites/integration-plan.md` (2026-11-15), which wins on conflict.** Corrections that apply here: the data stage is the shared `corpus:build` CLI writing `.corpus/` (not `apps/quiet/scripts/build-data.ts` reading `data/`); `packages/corpus-maps` is merged into `packages/normalize`; status values are `full`/`catalog-only`; public times are global seconds (`toLocal` builds the `/audio/{rec}.mp3#t=` links); the verbatim guard reports at 12 and auto-suppresses at 20 tokens; eligibility lives in `site-policy/transcript-eligibility.json`; audio uses the shared `@emunas/audio` handler; the hostname is the apex `<domain>`. See integration-plan §1.4 (C1–C21).

Status: implementation plan, nothing built. Companion to `docs/sites/concept-quiet.md`. Site code lives in `apps/quiet/` and `packages/*`. It never writes to `data/`, `scripts/` or `src/`; it only reads `data/` and imports types from `src/types.ts`.

Verified against the repo on 15 Nov 2026: 997 in-scope shiurim in `data/derived/ingest.json`; manifest 518 `done` / 479 `pending`; 519 `extraction.json` but only 518 `writeup.json` (one shiur is mid-processing, so the build must not trust "file exists"); 1,125 transcript files (63 MB); `input.txt` totals 52 MB of the 101 MB in `data/derived`; 1,129 recordings, 14.8 GB of mp3, largest 76 MB; 993 shiurim have one recording, 4 have several. All audio and all transcripts sit in **one private R2 bucket** (`emunas`, `R2_BUCKET` in `scripts/sync-transcripts.ts`): mp3s at `Recording.audioKey`, transcripts under `transcripts/…` (`.json/.txt/.vtt`). That last fact drives the audio design (§6).

---

## 0. Non-negotiables (enforced by code, not by convention)

1. **No transcript text reaches a browser.** Not displayed, not hidden in HTML, not in JSON, not in the search index, not as `heardAs`, not as `asrNotes`. Fields that count as transcript: `data/transcripts/*`, `data/derived/shiurim/*/input.txt`, `SourceMention.heardAs`, `concepts[].heardAs`, `people[].heardAs`, `asrNotes`, everything under `data/derived/audits/`, `Recording.transcriptKey`. `audioKey` (the private bucket path) is also not shipped.
2. **The public data is built from an allow-list.** One function in `packages/corpus` projects raw files to `PublicCorpus` (§3.3). Pages can only import `PublicCorpus`. There is no deny-list to forget a field in.
3. **Only one module may open transcripts**, `packages/corpus/src/transcript-gate.ts`, and it returns nothing unless the recording is approved in a site-owned eligibility file (§3.6). Today that file is empty, so the build never reads a transcript. Separately, the CI leak test reads transcripts to check the output against them; it is a test and ships nothing.
4. **Transcripts do not feed search**, hidden or not (decision 1 in the concept). The default is NO, and the plan keeps it NO until the owner decides per recording.
5. **The data is still arriving.** Each build takes whatever is in `data/` at that moment. A shiur has notes only if its manifest entry is `done`, `extraction.json` and `writeup.json` both exist and parse, and `writeup.extractionVariant === "extraction"`. Any other shiur renders as a pending catalog page. A malformed file downgrades that one shiur to pending with a warning in the build report. It never fails the build.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript, `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | The data has a lot of optional and nullable fields (`work`, `ref`, `recordingId?`); these flags make them visible. |
| Site framework | **Astro** (current major at start, exact version pinned), `output: "static"` | Zero JS by default, `.astro` components are close to plain HTML, and `getStaticPaths` fits 997 × 2 pages. No UI framework runtime (no React, no Preact). |
| Client scripts | Vanilla TS modules bundled by Astro/Vite, attached with `<script>` and progressive enhancement | Only the player (§7) and search (§5) run any script. The page works without either. |
| Styling | One hand-written CSS system: custom properties for tokens, **logical properties only** (`margin-inline-start`, `inset-inline-end`), `@layer` for base/layout/components/print; Stylelint with a logical-properties rule | RTL and LTR from the same CSS. No Tailwind, so print and RTL behave predictably. |
| Fonts | Self-hosted woff2, subset at build time with `fonttools`/`glyphhanger`: a Hebrew text face (candidate: Frank Ruhl Libre, OFL) and a Latin book face (candidate: Source Serif 4, OFL) | Concept rule: no third-party resources. Yiddish needs U+05F0–U+05F2 (װ ױ ײ), U+FB1D–FB4F and nikud. A test checks that coverage (§11). |
| i18n | Two editions as a route parameter `[ed]` ∈ {`yi`,`en`}, typed string tables `src/i18n/yi.ts` and `en.ts` sharing one `UiKey` union (a missing key fails `tsc`); `<html lang dir>` set per edition | Astro's i18n routing isn't needed. The two editions have identical structure (concept §8). |
| Search | **Pagefind** (pinned), index built with its Node API from custom records, no HTML scraping (§5) | Static, chunked and lazy-loaded, no backend, works on a filtered connection. |
| Hosting | **Cloudflare Workers with static assets**: one Worker `quiet-site` serves `dist/` and handles `/audio/*` only (`run_worker_first: ["/audio/*"]`) | One deployable. The Worker runs code only for audio. |
| Audio | A separate **public-content R2 bucket** with only mp3s, keyed by `recordingId`, read through an R2 binding from the site Worker with Range support (§6) | Keeps the transcripts' bucket private. |
| Hebrew calendar | `@hebcal/core` at **build time only** (devDependency, never bundled) for "this week" and the parsha/zman order | **Flag:** it is GPL-2.0. Using it only at build time ships no code, but the reconciler should confirm. Fallback: a committed parsha table for 5787–5800 generated once. |
| Validation of raw data | `valibot` (small) schemas mirroring `src/types.ts`, used only in the build | The data is LLM output and still arriving. Validate, then degrade to pending. |
| Package manager | npm workspaces (the repo already uses npm and `package-lock.json`) | The root `package.json` gains a `workspaces` field. That file belongs to the pipeline, so the reconciler does that edit, not a site agent. |

Rendering model: **fully pre-rendered HTML (SSG)**, rebuilt on data change and daily. No SSR, no runtime data fetch, no client routing. Every URL is a file.

---

## 2. Routes

All slugs are ASCII and stable, built from ids that exist before any AI data. Trailing slash on everything (`html_handling: "auto-trailing-slash"`).

| Path | Page | Source |
|---|---|---|
| `/` | Edition chooser (yi right, en left). Static, no redirect. | — |
| `/{ed}/` | Title page: this week, contents in brief, indexes, coverage line | corpus + calendar |
| `/{ed}/contents/` | Guide sections in guide order, Yiddish then English | `pocket-guide-2012.json` `sections[]` order, then uncatalogued sections |
| `/{ed}/section/{sectionId}/` | Section table, sub-grouped (chumash/parsha, zman order) | `catalog.sectionId` |
| `/{ed}/series/{seriesId}/` | Series as a course (Tanya grouped by `perek`) | `Series.shiurIds` |
| `/{ed}/shiur/{shiurId}/` | Shiur page (997 per edition) | everything |
| `/{ed}/calendar/parsha/` and `/{ed}/calendar/parsha/{parshaKey}/` | By parsha, both languages together, sorted by year | `parshaKey` (normalised) |
| `/{ed}/calendar/zman/` and `/{ed}/calendar/zman/{zmanKey}/` | By zman, from Elul | `zmanKey` (normalised) |
| `/{ed}/years/` and `/{ed}/years/{5743}/`, `/{ed}/years/unknown/` | Year index, partial and says so | `hebrewYears` |
| `/{ed}/sources/` and `/{ed}/sources/{workKey}/` | Sources by sefer, in traditional order | notes |
| `/{ed}/stories/` | Stories grouped by person (one page, jump list) | corpus layer (`stories.json`) |
| `/{ed}/people/` and `/{ed}/people/{personKey}/` | People | corpus layer (`people.json`, shiur refs) |
| `/{ed}/inyanim/` and `/{ed}/inyanim/{conceptKey}/` | Concepts (Hebrew headwords) | corpus layer (`concepts.json`, shiur refs) |
| `/{ed}/search/` | Search (Pagefind); without JS it shows the index links | search index |
| `/{ed}/about/` | About (human-written text, placeholder until supplied) | static |
| `/audio/{recordingId}.mp3` | Audio (Worker, Range); `?download=1` adds `attachment` | public audio bucket |
| `/pagefind/*` | Search index chunks | build |

**Entity pages only where they are worth a file.** A work, person or concept gets its own page when it occurs in **at least 2 shiurim** (concepts: at least 3 and not on the stop-list). Otherwise its line on the index page links straight to the shiur and time. This keeps the file count bounded (§9).

Edition switch: every page links to the same path with `/yi/` ↔ `/en/` swapped, keeping the hash. Shiur-page anchors are language-neutral (`#s3`, `#p3-2`, `#src12`).

Time links: `href="/audio/{rec}.mp3#t={sec}"` (works without JS, using the media fragment), `data-rec`, `data-t` for the player script.

---

## 3. The data build

### 3.1 Inputs (read-only)

| File | Used for | Read? |
|---|---|---|
| `data/derived/ingest.json` (1.4 MB) | shiurim, recordings (id, durationSec, sizeBytes, duplicateOf), series | yes, allow-listed fields |
| `data/derived/manifest.json` | status, promptVersion, validator counts | yes |
| `data/catalog/pocket-guide-2012.json` | section order, section `dir`, `pages` | yes (order and titles only) |
| `data/catalog/uncatalogued-guide.json` | section titles/notes for Current/Simchos | yes (titles only) |
| `data/derived/shiurim/<id>/meta.json` | `recordings[].starts/ends` (numbers only), `catalogTopics`, `totalDurationSec` | yes; `audioKey`, `asrModel`, `noise` are dropped |
| `data/derived/shiurim/<id>/extraction.json` | notes | yes, via the allow-list |
| `data/derived/shiurim/<id>/writeup.json` | write-up | yes, via the allow-list |
| `data/derived/shiurim/<id>/input.txt` | — | **never** |
| `data/transcripts/*.json` | — | **never** (only the gate in §3.6, off, and the CI leak test) |
| `data/derived/audits/*`, `usage.tsv`, `pilot-set.json` | — | never |

The data root is configurable (`EMUNAS_DATA_DIR`, default `<repo>/data`) so tests can point at fixtures.

### 3.2 Pipeline stages (`packages/corpus`, run by `apps/quiet/scripts/build-data.ts` before `astro build`)

1. **Load and validate** ingest, manifest and catalogs. A missing or invalid ingest or manifest is fatal; nothing works without them.
2. **Per shiur** (in-scope only): decide `notesStatus` (§0.5); load meta/extraction/writeup; validate with valibot; on failure set `pending` and add a report entry.
3. **Project** to `PublicShiur` (§3.3) with the allow-list. Drop items with confidence < 0.6. Drop sources with `resolution: "unresolved"` and `work: null`. **Remap `writeup.paragraphs[].sourceIdx`** to the filtered source list (the indexes point into the unfiltered `extraction.sources[]`).
4. **Resolve times**: `evidence.segs[0]` → `meta.recordings[rec].starts[seg]`. `rec` is `evidence.recordingId`, else the paragraph's section `recordingId`, else the shiur's only recording. Sections use `starts[startSeg]` / `ends[endSeg]`. An out-of-range index drops the time (the item stays) and logs a warning. A section whose time can't be resolved makes the whole shiur pending.
5. **Normalise** with `packages/corpus-maps`: `parshaKey`, `zmanKey` (+ seudah sub-heading), `workKey` + traditional order, Hebrew year strings (people and concepts are not keyed from the notes: their ids come from the corpus layer). An unmapped value never fails the build. It goes to the report and falls into an "other" bucket.
6. **Aggregate** the indexes: calendar, years, sources (work → ref → [shiur, time]), stories by person, people, concepts, catalog neighbours, series prev/next, coverage counts.
7. **Emit** `apps/quiet/.generated/` (git-ignored):
   - `corpus/shiur/<id>.json`, one `PublicShiur` per file (pages import per id, so no 100 MB object sits in memory per page)
   - `corpus/index.json`: list rows for all shiurim (id, catalog fields, oneLiner en/yi, duration, status), about 600 KB
   - `indexes/*.json`: calendar, years, sources, stories, people, concepts
   - `search-records.json`: input for Pagefind (§5)
   - `build-report.json`: counts (total / withNotes / pending / downgraded), unmapped zman/parsha/work/person values, dropped items, time-resolution warnings, verbatim-overlap findings (§11)
8. `astro build` reads only `.generated/`. A lint rule (`no-restricted-imports` + a path test) forbids `apps/quiet/src/**` from importing `packages/corpus/src/raw/**` or touching `data/`.

### 3.3 The public contract (sketch, in `packages/corpus/src/public.ts`)

```ts
type Ed = "yi" | "en";
interface L { en: string; yi: string }
interface At { rec: string; t: number }               // seconds into recording `rec`

interface PublicRecording { id: string; order: number; durationSec: number | null;
  audio: `/audio/${string}.mp3`; transcriptView: false /* §3.6 */ }

interface PublicShiur {
  id: string; lang: Ed; category: Shiur["category"];
  catalog: { source; sectionId; sectionTitle; n; page; titleOriginal; subTitle; heading?; derived; note };
  parsha: string | null; parshaKey: string | null; zman: string | null; zmanKey: string | null;
  perek: string | null; hebrewYears: number[]; seriesId: string | null; seriesOrder: number | null;
  recordings: PublicRecording[]; durationSec: number; pathNotes: string[];
  catalogTopics: string[];                            // from meta.json; catalog text, human
  notesStatus: "ready" | "pending";
  notes?: {
    promptVersion: { p4: string; p4b: string };
    oneLiner: L; abstract: L; keyPoints: { text: L; at?: At }[];
    sections: { title: L; summary: L; kind: SectionKind; at: At; end: number;
                catalogTopicIdx: number[]; sub: { title: L; summary: L; at: At }[] }[];
    sources: { work: string | null; workKey: string | null; ref: string | null; sefariaRef: string | null;
               resolution: "resolved" | "inferred" | "unresolved"; mention: string; at?: At }[];
    insights: { text: L; at?: At }[]; takeaways: { text: L; at?: At }[];
    questions: { q: L; a: L; at?: At }[];
    stories: { title: L; retelling: L; at?: At }[];
    // No people or concept names, and no story people: raw extraction names may be ASR mishearings.
    // People, concepts, works and a story's people come from the corpus layer: the shiur's refs in
    // `.corpus/layer/shiur/<id>.json` (personIds, conceptIds, merged story ids) and the entity files.
    topics: string[];                                 // candidateTopics: search keywords only, never shown
    writeup: Record<Ed, { sectionIndex: number; heading: string | null;
                          paragraphs: { text: string; src: number[]; at?: At }[] }[]>;
  };
}
```

Nothing named `heardAs`, `asrNotes`, `segs`, `audioKey` or `transcriptKey` exists in this type. A type-level test asserts that (`expectTypeOf<keyof …>` never includes them), and the dist scan in §11 checks again.

### 3.4 Incremental behaviour

- **Data layer:** each shiur has a fingerprint = sha256(manifest entry + meta + extraction + writeup + catalog row + `corpus-maps` version + projector version). `.generated/corpus/shiur/<id>.json` is rewritten only when the fingerprint changes. The cache is kept between CI runs (`actions/cache` on `.generated` and `.astro`). A full data stage over 997 shiurim reads about 50 MB of JSON and takes under 15 s even cold.
- **Page layer:** Astro re-renders every page each build. At about 7–9k pages this is minutes, not hours, which is acceptable for a daily build. No page-level incremental logic is needed. If it gets slow, shard by edition (two parallel `astro build` runs into one `dist`).
- **New data appears automatically:** no hand-kept list. A shiur flipping to `done` changes its fingerprint and moves it to `ready`. Coverage lines and AI indexes recompute.
- **Reprocessing:** a new `promptVersion` changes the fingerprint and the page changes at the same URL.

### 3.5 Size budgets

| Item | Budget | Estimate from today's data |
|---|---|---|
| Raw input actually read | — | ~38 MB (ingest 1.4 + meta 8.5 + extraction 24 + writeup 13; at 997 done, ~70 MB) |
| `.generated/` | ≤ 60 MB at full corpus | extraction minus heardAs/segs/asrNotes is about 55% of its size |
| Shiur page HTML (one edition) | ≤ 120 KB raw, ≤ 30 KB brotli | write-up per language median 8 KB, max 18 KB JSON; the page carries one language of notes |
| Pending shiur page | ≤ 15 KB raw | catalog + audio + neighbours |
| CSS (all) | ≤ 12 KB br | |
| JS on a shiur page | ≤ 6 KB br (player) | |
| JS on search page | Pagefind UI-less API + our 3 KB glue | Pagefind loads index chunks lazily |
| Fonts | ≤ 140 KB total woff2; only the edition's body face preloaded | |
| Static asset files | ≤ 18,000 (CI fails above; Free plan limit is 20,000 per version, Paid 100,000) | ~2,000 shiur + ~4,000 index pages at full corpus + ~1,500 Pagefind files + ~30 assets |
| Total `dist/` | ≤ 250 MB | ~150 MB |

Recommendation: **Workers Paid** ($5/month) for headroom on the file count and for audio Worker requests. The site also fits the Free plan if section-level search records stay off (§5).

### 3.6 The transcript door (built, locked)

- `apps/quiet/config/transcript-eligibility.json` is owned by the site and **ships empty: `{}`**. The schema per entry: `{ recordingId: { model, mode, transcribedAt, approvedBy, approvedAt, allowSearch: false } }`. The identity fields must equal the top-level `model`/`mode`/`transcribedAt` of `data/transcripts/<recordingId>.json`. A changed transcript automatically voids the approval.
- `packages/corpus/src/transcript-gate.ts` exports `readEligibleTranscript(recId)`. It returns `null` unless an entry exists and matches, and the build flag `QUIET_TRANSCRIPT_VIEW` is `"on"` (default off). It is the only file that may reference `data/transcripts`. A repo test greps for the string anywhere else.
- `PublicRecording.transcriptView` is the literal type `false` today. Turning the feature on is a deliberate type change plus a `FollowText.astro` component in the reserved slot. That component doesn't exist yet; the slot is an empty conditional that renders nothing.
- `allowSearch` stays false. Even once a transcript is approved, feeding search is a second, separate decision.

---

## 4. Rendering the pages (component plan)

`apps/quiet/src/`:

```
layouts/Base.astro          html lang/dir, nav line, edition switch, footer, skip link
layouts/Print.css            print layer (kuntres)
components/CatalogHeader.astro   title (dir=auto, lang by script), citation line, pathNotes
components/Listen.astro          <audio controls preload="none"> per recording + download link
components/NotesLabel.astro      single standing AI label (once per page)
components/Outline.astro         sections with time links; kind styling; "listed in the guide"
components/Writeup.astro         paragraphs, margin times, superscript source letters
components/SourceList.astro      grouped and graded ("apparently", "place not identified")
components/Apparatus.astro       key points, Q&A, stories, insights, takeaways (omit if empty)
components/Mentioned.astro       people/concepts links
components/Neighbours.astro      prev/next in section/series, same parsha/zman
components/TimeLink.astro        the one way to render a time (a11y label, bdi, href fallback)
components/HebrewYear.astro      תשמ"ג (1982–83)
components/Coverage.astro        "Compiled from N of 997" line for AI indexes
lib/bidi.ts                      script detection → dir/lang for mixed runs
pages/index.astro, pages/[ed]/…  routes in §2
scripts/player.ts, scripts/search.ts
```

Rules:
- **Three voices.** The catalog header uses `.voice-catalog` and the notes area `.voice-notes`, under a rule and the standing label. No `<blockquote>`, `<q>` or quote styling anywhere (Stylelint/HTML lint bans `blockquote` in `src/`).
- **Mixed direction.** Each catalog title is a `<bdi>` with `lang` from `lib/bidi.ts` (Hebrew letters dominate → `lang="he"` or `yi` by shiur language; Latin → `en`). Times, daf and pasuk numbers sit in `<bdi dir="ltr">`.
- **Write-up margin times** are a CSS grid column on `inline-start` (they flip automatically in RTL; in the Yiddish edition they sit on the left edge of the column, per concept §8).
- **Sources** use letters a, b, c… in en and א, ב, ג… in yi as superscripts linking to `#src{n}`. `sefariaRef` becomes an outbound link only for `resolved` (decision 5) as `https://www.sefaria.org/{encodeURIComponent(ref)}`, `rel="noopener"`, no prefetch.
- **Pending page.** Only `CatalogHeader`, `Listen`, `Neighbours` and one sentence. No skeletons.
- **No-recording rows** (the 3 "not on disk" + 8 "not in bucket" guide rows) appear greyed in section tables with "no recording" and get no page (decision 3). Purim seudos are not listed.

---

## 5. Search

**Choice: Pagefind, static, custom records, one shared index for both editions.**

- Built by `apps/quiet/scripts/build-search.ts` with the Pagefind Node API (`createIndex` → `addCustomRecord` → `writeFiles` to `dist/pagefind/`). We don't let Pagefind crawl HTML, so the exact fields that get indexed are under our control.
- One record per shiur (997). `url` is the edition-less path `shiur/{id}/`; the client prefixes `/{ed}/`. `content` is the folded text of: `titleOriginal`, `heading`, `subTitle`, parsha, zman, Hebrew year string, `catalogTopics`, and when notes exist `oneLiner`/`abstract`/`keyPoints`/section titles+summaries/story titles/question text in **both** en and yi, source `work`/`ref`, people names, concept terms, `candidateTopics`. **Not** included: write-up paragraphs (too large for the gain, and redundant with section summaries), anything transcript, `heardAs`.
- `meta`: `titleOriginal`, citation string, `oneLinerEn`, `oneLinerYi`, `lang`, `status`. `filters`: `lang`, `category`, `status`. Results render from meta only (title, citation, one-liner in the edition's language). **Excerpts are not shown** because they would mix languages; this also keeps result text to fields we chose.
- **Folding** (`packages/corpus-maps/fold.ts`, used both at index time and on the query): strip nikud and cantillation (U+0591–U+05C7), remove geresh/gershayim and ASCII/curly quotes (`ל"ג`, `ל”ג`, `ל״ג` → `לג`), unify `־`/`-`, lowercase Latin, and apply a small transliteration variant table (chanukah/chanuka/hanukkah, shabbos/shabbat…). The record language is `"unknown"` (no stemming), so Hebrew and English tokens sit in one index.
- **Size:** at full corpus about 1,000 fragments plus index chunks, a few MB total, each query loads tens of KB.
- **Later, if wanted:** section-level records (~10k files at full corpus) would show "matching section". That needs the Paid plan file budget. Deferred.
- **Without JS** `/search/` is a plain page listing the indexes with one sentence. `<noscript>` isn't needed; the script replaces the list with a search box when it loads.
- **Rejected alternatives:** a Worker + D1 FTS5 search API (adds a backend and a moving part; static is enough at 997 docs); Vectorize/semantic search (needs an embedding index; out of scope for "Quiet" and leans toward the "same idea" features the concept avoids). Both remain open to the reconciler if the other site builds one.

---

## 6. Audio from R2

**Problem:** the existing bucket `emunas` holds mp3s *and* transcripts (`transcripts/…` with `.json/.txt/.vtt`). Making that bucket public (r2.dev or custom domain), or proxying arbitrary keys from it, would publish the transcripts. Not allowed.

**Plan:**
1. Create a second bucket **`emunas-audio`** (name for the reconciler) that holds **only** mp3s, keyed `{recordingId}.mp3` (slugs are ASCII; the private keys have spaces and Hebrew-transliterated folder names). Object metadata: `contentType: audio/mpeg`, `cacheControl: public, max-age=604800`, `contentDisposition: inline; filename="{readable}.mp3"`.
2. A publish tool, **`packages/audio-publish`** (CLI, run by a person with R2 credentials, not by the site build): for every in-scope recording whose shiur is in scope and whose `duplicateOf` is null, server-side copy `audioKey` from `emunas` to `emunas-audio/{id}.mp3` (S3 CopyObject; no download through the runner), skipping objects whose size/etag already match. It writes `audio-manifest.json` (id → size, etag) into `apps/quiet/config/`, committed. Reruns are idempotent. It refuses any source key not ending in `.mp3` or starting with `transcripts/`.
3. The **site Worker** handles `GET|HEAD /audio/{id}.mp3`:
   - accepts only `^[a-z0-9-]+\.mp3$` and ids present in the bundled audio manifest (404 otherwise)
   - `env.AUDIO.get(key, { range: request.headers, onlyIf: request.headers })` → `206` with `Content-Range`, `Accept-Ranges: bytes`, `Content-Length`, `ETag`, `Last-Modified`; `304`/`412` for conditionals; `HEAD` via `env.AUDIO.head`. Correct 206 handling matters for Safari and for seeking. Workers static assets return `200` for Range requests, which is another reason audio is not a static asset (and it would also break the 25 MiB file limit).
   - `?download=1` sets `Content-Disposition: attachment`.
   - No Cache API in v1. R2 range reads are cheap and there is no egress cost. Add caching later only if R2 Class B operations show up on the bill.
4. **Same origin** (`/audio/…` on the site host): no CORS, `media-src 'self'` in the CSP, the `download` attribute works, and filtered networks see a single host.

Alternative, recorded for the reconciler: attach a custom domain such as `audio.<domain>` directly to `emunas-audio` (no Worker, Cloudflare cache does the ranges). That is fine **only because the bucket holds nothing else**. It costs CORS/CSP entries and cross-origin downloads. Either way, the separate bucket is the essential part.

**Owner decision still needed** (concept decision 2): public access to the audio at all, and whether downloads are offered. Until it's decided, `audio-publish` is not run and the Worker's `/audio/*` answers 503 with a plain page. Shiur pages still render; the player shows "the recording is not yet available online".

---

## 7. Player architecture

- **Baseline (no JS):** each recording is a native `<audio controls preload="none" src="/audio/{id}.mp3">`. Every time link is `href="/audio/{id}.mp3#t=754"` and opens the browser's media view at that second.
- **Enhancement (`scripts/player.ts`, ≤ 6 KB br, no dependencies):**
  - one `Player` controller per page; the first `<audio>` becomes a sticky dock (`position: sticky`, top) once playback starts
  - delegated click handler on `a[data-rec][data-t]`: switch recording if needed, set `currentTime`, `play()`, `preventDefault()`
  - **margin mark:** paragraph and section start times are in `data-t`. On `timeupdate` (throttled to 4 Hz), binary-search the current item and toggle `aria-current="time"` on it. No auto-scroll, no sweeping highlight.
  - Media Session API metadata (catalog title, citation) for lock-screen controls
  - keyboard: Space/K play-pause and ←/→ ±10 s, only while the dock has focus (never global)
  - `prefers-reduced-motion`: no transitions
  - no localStorage resume. The concept wants visited-link colour as the only progress tracking. An optional "resume" can come later as a per-viewer convenience.
- Multi-recording shiurim list the tracks in order. When one ends, the next starts. `ingest.json` today has 4 in-scope shiurim with more than one recording (three with 2, one with 4). The concept's "39, one with 21" doesn't match ingest and should be rechecked; the design works for any count.

---

## 8. Workers, bindings, configuration

One Worker, `quiet-site` (`apps/quiet/worker/index.ts`):

```jsonc
// apps/quiet/wrangler.jsonc (sketch)
{
  "name": "quiet-site",
  "main": "worker/index.ts",
  "compatibility_date": "<pin at implementation>",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page",
    "run_worker_first": ["/audio/*"]
  },
  "r2_buckets": [{ "binding": "AUDIO", "bucket_name": "emunas-audio" }],
  "vars": { "AUDIO_ENABLED": "false" }
}
```

API surface (the whole backend): `GET|HEAD /audio/{recordingId}.mp3[?download=1]`. No database, KV, D1 or Vectorize. Error reports are a `mailto:` link prefilled with the shiur id (concept §5.4.10). If the owner later wants a form, that is a small `POST /report` → Email Workers or D1, out of scope here.

`dist/_headers`:
- `/*`: `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; font-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` (Pagefind needs `wasm-unsafe-eval`), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` minimal
- `/_astro/*`, `/fonts/*`: `Cache-Control: public, max-age=31536000, immutable`
- HTML: the platform default (revalidating); pages change daily.

**Deploy and rebuild** (`.github/workflows/quiet.yml`; the reconciler may merge it into shared CI):
- triggers: push to the main branch touching `data/derived/**`, `data/catalog/**`, `apps/quiet/**`, `packages/**`; schedule daily at 05:17 UTC (about 00:17 US Eastern; picks up data and refreshes "this week"); manual dispatch
- `concurrency: quiet-deploy, cancel-in-progress: true`, since data commits arrive in bursts
- steps: install → `build-data` → `astro build` → `build-search` → guards (§11) → `wrangler deploy` (secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- PRs: `wrangler versions upload` gives a preview URL, no promotion
- the checkout needs `data/transcripts` only for the leak test; nothing else in the build reads it.

Custom domain: attached to `quiet-site` via `routes`/custom domains. The hostname is the reconciler's call.

---

## 9. Monorepo layout and what to share

```
apps/quiet/
  astro.config.ts  wrangler.jsonc  tsconfig.json  package.json
  config/transcript-eligibility.json   ({}), audio-manifest.json (generated by audio-publish, committed)
  scripts/build-data.ts  build-search.ts  check-budgets.ts
  src/ (layouts, components, pages, i18n, lib, scripts, styles)
  worker/index.ts
  public/fonts/  public/favicon.svg
  test/ (unit, e2e, fixtures-derived/)
packages/corpus/        SHARED: raw loaders + valibot schemas, allow-list projector, PublicCorpus types,
                        time resolver, status gating, transcript-gate, leak-check utilities
packages/corpus-maps/   SHARED: parsha & zman normalisation (keys, order, yi/en labels), Hebrew year/gematria,
                        works alias + traditional order, people alias, concept stop-list, search folding
packages/audio-publish/ SHARED: private → public audio copy CLI + audio manifest
packages/audio-edge/    SHARED: `handleAudio(request, env, manifest)` Range/conditional/HEAD handler
```

Strongly recommended to share, because both sites must agree:
1. **`packages/corpus` projector and transcript gate.** The transcript rule should be enforced in exactly one place for both sites, with one leak test.
2. **`packages/corpus-maps`.** These alias tables are the first thing human reviewers will edit. Two copies would drift.
3. **Audio:** one public bucket, one handler, possibly one audio host.
4. **The search folding function**, if the other site does client search too.
5. CI guard scripts (dist scan, n-gram leak test).

Site-specific: everything in `apps/quiet/src`, CSS, fonts, i18n strings, the Pagefind record shape.

`packages/corpus` imports types from `../../src/types.ts` via a path alias (read-only, no copy). If the pipeline changes a type, `tsc` breaks the site build, which is what we want.

---

## 10. Normalisation tables (site-owned data in `packages/corpus-maps`)

| Table | Content | Coverage target at launch |
|---|---|---|
| `parsha.ts` | 54 sedros + combined parshiyos: key, chumash, order, yi label, en label, catalog spellings | 100% of `Shiur.parsha` values (CI fails on a new unmapped parsha) |
| `zmanim.ts` | ordered list from Elul; aliases (`יו”כ`/`יום הכיפורים`, `ל"ג בעומר`/`ל”ג בעומר`, `שובבי"ם`/`שובבים`, `ט"ו בשבט`/`ט”ו בשבט`); `סעודת X` → zman X with sub-heading; one-offs (`מהר"ל גבורת ה'`, camp drasha) → "other" | every value seen today (about 60 distinct); new unmapped values are reported and go to "other" |
| `works.ts` | alias → workKey, group (Torah/Nevi'im/Kesuvim/Mishnah/Bavli/Yerushalmi/Midrash/Zohar/Rishonim/Acharonim+Chassidus), order within group, yi/en display | groups for all works with ≥ 2 shiurim (398 today); the rest alphabetical under "other" |
| `people.ts` | alias → personKey, display yi/en | merge the obvious duplicates; the people index can ship after the others (concept §5.9) |
| `concepts.ts` | stop-list of trivial terms; min-shiurim threshold 3 | 649 terms qualify today |
| `fold.ts` | search folding (§5) | — |

Each table has a test: "every value currently in the corpus maps or is explicitly listed as other". The build report lists new strings that arrive with new data, so a person can extend the tables.

---

## 11. Testing, guards, performance, accessibility

**Unit (vitest)**
- projector: a real-shaped fixture of extraction/writeup/meta (built from *derived* text, with synthetic numbers; **fixtures never contain transcript text**) → `PublicShiur`; confidence cut; source filtering with `sourceIdx` remapping; time resolution with multi-recording and default-recording rules; out-of-range segs
- status gating: done + both files; done + missing writeup (today's real case) → pending; invalid JSON → pending + report
- maps: every current parsha/zman value maps; gematria for 5724–5780; folding cases
- transcript-gate: returns null with an empty eligibility file; returns null if the identity mismatches; is the only module referencing `data/transcripts` (repo grep test)
- audio-edge: Range (`bytes=0-`, `bytes=100-199`, suffix `bytes=-500`), `If-None-Match`, HEAD, bad id, disabled flag. Run under `@cloudflare/vitest-pool-workers` with a local R2.

**Transcript-leak guards (CI, block deploy)**
1. **Dist key scan:** no file in `dist/` or `.generated/` contains the strings `heardAs`, `asrNotes`, `transcriptKey`, `audioKey`, `"segs"`, `input.txt`, `transcripts/`.
2. **Verbatim n-gram check:** tokenise (nikud-stripped) every shipped text field and every transcript. Report any run of ≥ 10 identical tokens; **fail on ≥ 16** unless the run is in `config/verbatim-allow.json` (for pesukim and well-known quotations, reviewed by a person). Measured today on 104 sampled write-ups: 37 contain an 8-token overlap (mostly pesukim and set phrases), **3 contain a 12-token overlap**. So the AI text does sometimes carry verbatim runs from the ASR. The thresholds above are a starting point; the report goes to the owner. This is the only place outside the gate that reads transcripts, and it writes only a report.
3. **Search index scan:** decode the Pagefind records (Node API output before writing) and run checks 1 and 2 on them.
4. **Import boundary:** `apps/quiet/src/**` cannot import `packages/corpus/src/raw/**`, `node:fs` or any `data/` path (ESLint `no-restricted-imports` + test).

**End-to-end (Playwright, against `wrangler dev` serving `dist`)**
- JavaScript **disabled** project: title page, contents, a section, a shiur with notes, a pending shiur, the calendar, a sources work page, the search fallback. Every page renders, time links have `#t=` hrefs, and there are no broken internal links.
- JavaScript enabled: clicking a time link seeks the docked player; the margin mark moves; search for `לג בעומר` and `lag baomer` finds the same shiurim.
- Sample real pages of each kind: a Yiddish parsha (`yi-parshas-hashavua-brshys-01`), an English parsha (`en-parsha-en-nch-02`), a zman, a Tanya set (pending), a Simchos row (pending, uncatalogued), the shiur with several recordings.
- Visual snapshots in both editions plus print-media screenshots.

**Link and HTML checks:** crawl `dist/` for internal links (every href resolves to a file, every anchor exists) and run `html-validate` on a sample of 200 pages.

**Budgets (`check-budgets.ts`, fails CI):** the table in §3.5. Lighthouse CI on 5 representative pages: performance ≥ 95 on mobile, LCP < 1.8 s on simulated 4G, CLS < 0.02, total blocking time ≈ 0.

**Accessibility (WCAG 2.2 AA)**
- axe-core in Playwright on every sampled page, both editions; zero violations
- `lang` and `dir` correct on `<html>` and on every mixed-script run; screen readers switch voices on Hebrew catalog titles inside English pages
- skip link, landmarks (`nav`, `main`, `aside` for the apparatus), one `h1`, a heading outline that follows the page parts
- time links have localised accessible names ("Play from 12:34" / "שפיל פון 12:34"); the current item uses `aria-current`, not colour alone
- tables use `<th scope>` and a `<caption>`; source grading is in words, not colour
- contrast ≥ 4.5:1 on the paper background in both themes; focus always visible; `prefers-reduced-motion` respected
- print: nav and player hidden; sources as footnotes; times kept as plain text

**Fonts:** a test with fontTools asserts that the subset includes U+05D0–U+05EA, U+05F0–U+05F4, U+FB1D–U+FB4F, U+0591–U+05C7, and the Latin needed for transliteration (ḥ, ', ’).

---

## 12. Work breakdown

Each task belongs to one agent and touches only its listed paths. The **contract first** rule: T1 merges `packages/corpus/src/public.ts` (types only) and a fixture `.generated/` on day one, so the page tasks can start against fixtures before the real projector is finished.

```
T0 ──┬── T1 ──┬── T5, T6, T7, T8, T9 ── T12 ── T14
     ├── T2 ──┘           │
     ├── T3 (audio) ──────┤
     ├── T4 (design) ─────┘
     ├── T10 (player; needs T6 markup contract)
     └── T11 (guards; can start on fixtures)          T13 (copy) anytime
```

| # | Task | Owns | Inputs | Outputs | Acceptance |
|---|---|---|---|---|---|
| T0 | Workspace scaffold | `apps/quiet/` skeleton, `packages/*/package.json`, tsconfig bases, ESLint/Stylelint/Prettier configs; **proposes** the root `package.json` `workspaces` edit to the reconciler | this doc | an empty Astro site that builds and deploys to a preview | `npm run -w apps/quiet build` passes; `tsc --strict` clean; no files changed in `data/`, `scripts/`, `src/` |
| T1 | Corpus projector | `packages/corpus` | `data/derived/*`, `data/catalog/*`, `src/types.ts` | `PublicCorpus` types (day 1), loader, gating, projector, time resolver, transcript-gate (locked), `build-data.ts`, `build-report.json`, fixtures | unit tests in §11; on today's data: 997 shiurim, 518 ready, `yi-…` with extraction but no writeup → pending; zero `heardAs`/`asrNotes` in output; data stage < 20 s |
| T2 | Normalisation maps | `packages/corpus-maps` | values from ingest + extractions | parsha, zmanim, works, people, concepts, Hebrew year, fold | 100% parsha mapped; every current zman mapped or explicitly "other"; works with ≥ 2 shiurim grouped and ordered; tests for gematria and folding |
| T3 | Audio delivery | `packages/audio-publish`, `packages/audio-edge`, `worker/index.ts` audio route | ingest recordings, R2 credentials (run by a person) | public bucket contents, `audio-manifest.json`, Worker handler | refuses non-mp3 and `transcripts/` keys; idempotent rerun copies 0 objects; Range/HEAD/304 tests pass; Safari plays and seeks in a manual check; `AUDIO_ENABLED=false` → 503 page |
| T4 | Design system and shell | `src/styles`, `src/layouts`, `src/i18n`, `src/lib/bidi.ts`, `public/fonts`, `TimeLink`, `HebrewYear`, `Coverage` | concept §8, §11 | tokens, typography, RTL/LTR layout, nav line, edition switch, print layer, i18n tables | both editions render a sample page correctly; logical-properties lint clean; font coverage test; print preview matches the kuntres layout |
| T5 | Catalog pages | `pages/[ed]/index`, `contents`, `section/*`, `series/*` | T1 index.json, T2, T4 | title page (incl. "this week" via build-time calendar), contents, sections, series | guide order matches `pocket-guide-2012.json`; uncatalogued rows marked; no-recording rows greyed; Tanya grouped by perek; counts match ingest stats |
| T6 | Shiur page | `pages/[ed]/shiur/*`, components listed in §4 | T1 per-shiur JSON, T4 | 1,994 pages, both states | sampled pages from §11 render all parts; empty lists omitted; confidence < 0.6 absent; source letters link both ways; pending page = header + audio + neighbours + one sentence; page budget met |
| T7 | Calendar and years | `pages/[ed]/calendar/*`, `years/*` | T1, T2 | parsha and zman indexes and pages; year index with "not recorded" | both languages merged per parsha/zman, sorted by year; seudah sub-headings; 386 undated explained; uncatalogued guesses excluded (decision 7) |
| T8 | AI indexes | `pages/[ed]/sources/*`, `stories`, `people/*`, `inyanim/*` | T1 indexes, T2 | four indexes with coverage lines | traditional order; resolved/apparently/place-not-identified wording; entity pages only at ≥ 2 shiurim (concepts ≥ 3); every line links to shiur + time |
| T9 | Search | `scripts/build-search.ts`, `pages/[ed]/search`, `src/scripts/search.ts` | T1 search-records, T2 fold | `dist/pagefind/`, search page | records contain only the fields in §5; folding parity tests; works without JS (fallback); ≤ 3 KB glue JS |
| T10 | Player | `src/scripts/player.ts` | T6 markup contract (`data-rec`, `data-t`, `aria-current`) | enhancement script | e2e: seek, dock, margin mark, track switch, keyboard; ≤ 6 KB br; nothing breaks with JS off |
| T11 | Guards and CI checks | `apps/quiet/test/guards/*`, `check-budgets.ts`, verbatim allow-list file (empty) | `dist/`, `.generated/`, `data/transcripts` (test-only) | dist scan, n-gram check, import boundary, budgets, link check, axe/Playwright harness | guards fail on a planted `heardAs` and on a planted 20-token transcript run; report lists today's overlaps |
| T12 | Deploy pipeline | `wrangler.jsonc`, `_headers`, `.github/workflows/quiet.yml` | all builds | preview on PR, production on main + daily cron | a data-only commit redeploys within one run; CSP blocks third-party loads; concurrency cancels stale runs; file count reported |
| T13 | About and fixed copy | `src/content/about.{yi,en}.md`, UI copy review | owner/community text | placeholders clearly marked until text arrives | no generated text in About; Yiddish copy reviewed by a Yiddish reader |
| T14 | Launch review | — | everything | checklist sign-off | owner decisions in §13 answered; leak report reviewed by a person |

Parallelism: after T0 (half a day), T1–T4 and T11 run in parallel. T5–T9 run in parallel once T1's contract and fixtures and T4's shell exist. T10 follows T6's markup contract (agreed in T6's first commit). T12 can deploy the empty shell from day one.

---

## 13. Decisions and risks to flag

| # | Item | Default in this plan |
|---|---|---|
| 1 | Transcripts in a hidden search index | **No.** Not read by the build. Gate exists, off, with a separate `allowSearch` flag. |
| 2 | Public audio at all; downloads | Not until the owner says. Infrastructure is ready (separate bucket, Worker route), `AUDIO_ENABLED=false`. |
| 3 | Same origin `/audio/*` vs `audio.<domain>` on the public bucket | Same origin. Reconciler may move to a shared audio host for both sites. |
| 4 | Verbatim runs in AI text (measured: 3/104 sampled write-ups have 12+ identical tokens with the ASR) | Report ≥ 10 tokens, fail ≥ 16 unless allow-listed. **The owner should confirm whether short verbatim runs (pesukim, set phrases) are acceptable** under "no verbatim quotes". |
| 5 | `@hebcal/core` is GPL-2.0 (build-time only) | Use at build time; fallback is a committed table. |
| 6 | Workers plan | Paid recommended (file headroom). Free works with section-level search off. |
| 7 | Root `package.json` workspaces edit | Done by the reconciler, not the site agent (pipeline file). |
| 8 | Sefaria out-links, "apparently" sources, unreviewed notes | As the concept: resolved-only links, inferred shown as "apparently", notes shown under the label. |
| 9 | Data drift: new zman/parsha spellings, new works | Never fails the build; listed in `build-report.json` for a person to map. |
| 10 | A shiur whose files exist but whose manifest entry isn't `done` (today: one) | Pending. Status is the source of truth, files are not. |
