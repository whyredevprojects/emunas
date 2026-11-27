# Integration plan: two sites, one repo

Status: plan, nothing built. Lead-architect decisions that let the "Quiet" site (`concept-quiet.md`, `tech-quiet.md`) and the "Live" site (`concept-live.md`, `tech-live.md`) live in one monorepo next to the data pipeline and ship on Cloudflare. **Where this document and a tech plan disagree, this document wins.** Both tech plans carry a header note saying so.

Figures checked against the repo on 2026-11-15: 997 in-scope shiurim (730 yi, 267 en), manifest 518 `done` / 479 `pending`, 519 shiur directories (one partial: `yi-zmanim-msybs-lchyym-bkmp-01-c` has no `writeup.json`), 1,129 recordings, 4 multi-recording shiurim, 1,125 transcript files (63 MB). Samples read: `yi-parshas-hashavua-brshys-01` (Yiddish parsha, 12 sections, 21 sources), `en-parsha-en-nch-01` (English parsha, 13 sections, 34 sources), `yi-zmanim-tv-bb-04` (zman, 2 recordings, `evidence.recordingId` set), `yi-tanya-1-01` (Tanya, no directory yet = catalog-only).


> **Amendment A1 (owner decision, 2026-11-15): audio is served directly from the existing `emunas` R2 bucket on a public custom domain `media.<domain>`, with CORS headers set on the bucket by the owner. No `emunas-audio` bucket, no copy/publish CLI, no audio Worker, no `/audio/*` routes, no `AUDIO_ENABLED` 503 switch.** The transcripts in the bucket being publicly reachable but unlinked is accepted by the owner (they will be removed from the bucket later). Consequences, overriding everything below that conflicts (C12–C15, §3.1 R2 rows, §3.2, §3.3 `/audio/*`, §2.2 audio row, W1.5, W2.7, W3.11, W4.8):
> - Public audio URL = `${MEDIA_ORIGIN}/${encodeURIComponent-per-path-segment(audioKey)}`; `MEDIA_ORIGIN` is build config (env `EMUNAS_MEDIA_ORIGIN`, e.g. `https://media.<domain>`). The corpus build emits `recordings[].audioUrl`; the raw field name `audioKey` stays forbidden in public output, and no public string may contain `transcripts/`.
> - Range requests and edge caching come from Cloudflare's CDN in front of the R2 custom domain (mp3 is cached by default). Cost: no egress; only cache-miss Class B reads.
> - Both sites use plain `<audio src>` to the media host; CSP `media-src` allows the media origin. Neither site fetches audio with `fetch()`, so no site needs CORS on the bucket (Live has no service worker, see W4.8). The `download` attribute is ignored cross-origin, so "download" links save under the bucket filename unless the owner sets `Content-Disposition` on objects.
> - Recordings whose key is not `.mp3` (3 `.WMA` today) are shown as unavailable rather than linked.
> - `@emunas/audio` shrinks to: `mediaUrl(key, origin)`, `buildAudioTable(corpusRecordings)` (id → url, duplicateOf → canonical), and the playability rule. W3.11 only attaches the custom domain and CORS rules.
> - Done in W2.8 (packages/audio, corpus build). The sections listed above have been edited to match; where an old decision is kept for history it is marked "superseded by A1".

---

## 0. Hard rules (both sites, enforced in shared code)

1. **No transcript text reaches the public, in any form.** The ASR in `data/transcripts/*` is rough budget output and is build-time input only. No transcript view, no live/scrolling captions, no quotes, no search snippets from it, no `heardAs`, no `asrNotes`, no `input.txt`, no `audits/`, no `transcriptKey`, no `audioKey`. Public text comes only from the catalog (`ingest.json`, `data/catalog/*.json`) and the derived AI data (`extraction.json`, `writeup.json`, numbers from `meta.json`).
2. **Transcripts do not feed any search index, hidden or not.** Default NO, flagged for the owner (decision O1). Nothing in the schema reserves room for it.
3. **One door, locked.** A transcript view exists only as a gated design: `site-policy/transcript-eligibility.json` (ships `{ "policyVersion": 1, "eligible": {} }`) **and** the build flag `EMUNAS_TRANSCRIPT_VIEW=on` (default off) must both allow a recording. Only `packages/corpus/src/transcript-gate.ts` may reference `data/transcripts` for building; only `packages/corpus-guard` may read it for leak checking. A repo test greps for the path anywhere else.
4. **Data keeps arriving.** Every build takes what is in `data/` at that moment. A shiur without valid derived data is a normal catalog-only page with audio. Bad data in one shiur downgrades that shiur and never fails the build.
5. **Site code never writes to `data/`, `scripts/`, `src/` or `config/`** (pipeline territory). It reads `data/` and imports types from `src/types.ts`.

---

## 1. Monorepo

### 1.1 Tool: npm workspaces (decided)

The repo already uses npm (`package-lock.json`, `tsx`, TS 7). pnpm (tech-live) is rejected: a second package manager and lockfile next to the pipeline for no real gain at this size. No Turborepo/Nx; `npm run <x> --workspaces --if-present` and explicit CI steps are enough.

The only edit to a pipeline-adjacent file: root `package.json` gains

```json
"workspaces": ["packages/*", "apps/*", "workers/*"]
```

and a few `site:*` scripts. Existing scripts and dependencies stay untouched; root `tsconfig.json` (`include: src, scripts`) stays untouched, so `npm run typecheck` for the pipeline is unaffected. `package-lock.json` is regenerated once by the scaffold (W1.1) and afterwards only by the person who merges a wave (agents do not commit lockfile changes; they list new deps in their package's `package.json`).

**TypeScript 7 caveat:** root uses `typescript@^7` (native compiler). Typecheck everything with it (`tsc -b`). Astro's `astro check` and some editor tooling still need the TS 5 language-service API; `apps/quiet` may pin `typescript@5.x` as its own devDependency for `astro check` only (npm nests it). Vite/Astro/RR7 transpile with esbuild and don't care.

### 1.2 Layout

```
apps/
  quiet/          Astro static site + worker/index.ts (static assets, headers)     → Worker "emunas-quiet"
  live/           React Router v7 (ssr:false + prerender) + worker/index.ts        → Worker "emunas-live"
                  (/api/* and /admin/* via service binding, "/" language redirect; no audio route, A1)
workers/
  api/            search (D1 FTS5 + Vectorize + Workers AI) and feedback (D1, Turnstile) → Worker "emunas-api"
packages/
  config/         tsconfig.base.json, eslint (restricted imports/literals), stylelint (logical props only), vitest base
  corpus/         THE data layer: raw loaders + valibot schemas, status gate, allow-list projection, time model,
                  moment ids, aggregation, transcript gate, build CLI → .corpus/ ; fixtures
  corpus-guard/   leak scanner (keys, substrings, verbatim n-grams), pre-pass suppression list, budgets helpers
  normalize/      text folding, alias tables (parsha, occasions/zmanim, works+order, people, concepts), stable keys,
                  Sefaria ref parser, Hebrew year gematria
  calendar/       build-time generator (@hebcal/core) → committed table; runtime thisWeek() over the table
  audio/          media-host audio URLs (mediaUrl), audio table, playability rule (A1; no Worker, no copy)
  links/          URL builders for both sites, cross-site equivalents, canonical/hreflang helpers, host config
  search-core/    the indexed-field allow-list → SearchDoc / MomentRow; query normalization + alias expansion
  i18n/           shared formatting (Hebrew year, durations, plurals, numbers), data-vocabulary labels, bidi/script helpers, t() factory
  tokens/         design primitives as CSS custom properties + subset self-hosted fonts (Hebrew + Latin)
site-policy/      transcript-eligibility.json, publish-policy.json, verbatim-allow.json (human-edited, reviewed)
.github/workflows/ ci.yml, deploy.yml
data/ scripts/ src/ config/ prompts/   pipeline (unchanged, read-only for site code)
```

All packages are `"private": true`, named `@emunas/<dir>`, ESM, TypeScript source consumed directly (no per-package build step; `exports` point at `src/*.ts`, Vite/Astro/wrangler/tsx all handle that). Each package extends `@emunas/config/tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: bundler`).

`packages/corpus` imports pipeline types with a relative path (`../../src/types.ts`), read-only. A pipeline type change breaks the site typecheck, which is wanted.

### 1.3 What is shared and what is not

| Concern | Shared? | Where | Notes |
|---|---|---|---|
| Data types (raw) | yes | `src/types.ts` (pipeline) | imported, never copied |
| Public data contract | yes | `@emunas/corpus/public` | browser-safe subpath (types + pure helpers, no `node:fs`) |
| Load / validate / gate / project / time resolution | yes | `@emunas/corpus/build` | one implementation, one transcript rule |
| Aggregated indexes (works, people, concepts, occasions, years, series, stories) | yes | `@emunas/corpus/build` aggregate step | both sites render the same groupings and keys |
| Normalization + alias tables | yes | `@emunas/normalize` | the first thing a human reviewer edits; one copy |
| Hebrew calendar / parsha / gematria | yes | `@emunas/calendar`, `@emunas/normalize` (gematria) | |
| Audio URLs, audio table, playability rule | yes | `@emunas/audio` (called by `corpus:build`) | both sites link the same `recordings[].audioUrl` on `media.<domain>` (A1) |
| Leak guard | yes | `@emunas/corpus-guard` | runs over both sites' outputs in one CI step |
| Search documents (what is indexed) | yes | `@emunas/search-core` | Pagefind (Quiet) and D1/Vectorize/MiniSearch (Live) index the same allow-listed fields |
| Query folding / alias expansion | yes | `@emunas/search-core` (uses `normalize`) | same in Pagefind glue, MiniSearch, Worker |
| Cross-site URLs | yes | `@emunas/links` | |
| i18n: formatting + data vocabulary (category, section kind, resolution wording, occasion labels) | yes | `@emunas/i18n` | |
| i18n: UI strings | **no** | `apps/*/…/i18n/{en,yi,he}.ts` (one table per `UI_LANGS` language) | different products, different voice; both use `createT<Keys>()` from `@emunas/i18n` |
| Design tokens: fonts, type scale, spacing, base palette roles | yes | `@emunas/tokens` | |
| Theme, components, CSS | **no** | each app | Quiet: printed catalog; Live: app shell |
| Player | **no** | Quiet `apps/quiet/src/scripts/player.ts` (≤6 KB vanilla); Live `apps/live/app/player-engine/` | timeline math (global ↔ recording-local seconds) is shared in `@emunas/corpus/public` |
| Framework | **no** | Astro (Quiet), React Router 7 + React 19 (Live) | the two concepts need different runtimes; shared packages are framework-free |
| Workers | site Workers per app (thin, no audio route); one `emunas-api` Worker | | |
| Policy files | yes | `site-policy/` | one eligibility file, one publish policy |

### 1.4 Conflicts between the two tech plans, resolved

| # | Topic | tech-quiet | tech-live | **Decision** |
|---|---|---|---|---|
| C1 | Package manager | npm workspaces | pnpm | **npm workspaces** (§1.1) |
| C2 | Shared data package names | `corpus`, `corpus-maps` | `corpus`, `corpus-guard`, `normalize`, `hebcal-map` | `corpus`, `corpus-guard`, `normalize`, `calendar` (§1.2); `corpus-maps` is merged into `normalize` |
| C3 | Who runs the data stage | Quiet's `build-data.ts` | Live's `build/index.ts` | **One shared CLI** `npm run corpus:build` → `.corpus/` (gitignored). Apps read only `.corpus/`, never `data/`. Quiet emits pages from it; Live emits `/data/*.json` from it. |
| C4 | Status gate | done + extraction + writeup + `extractionVariant === "extraction"` | done + 3 files + structural check | **Union of both**: manifest `done` AND `meta`/`extraction`/`writeup` exist, parse and validate AND `writeup.extractionVariant === "extraction"` AND structural checks (seg ranges within `starts.length`, recording ids belong to the shiur, `sectionIndex`/`sourceIdx` in range, sections tile). Status values: `"full" \| "catalog-only"`. |
| C5 | Time model | `{rec, t}` per recording | global seconds + `recordings[{id, offset, duration}]` | **Global seconds** `t` everywhere in the public model and in URLs, plus the recordings table. `@emunas/corpus/public` exports `toLocal(shiur, t) → {recordingId, t}` and `toGlobal`. Quiet's no-JS link `href="{audioUrl}#t={local}"` (`mediaTimeUrl` from `@emunas/audio`) is computed with `toLocal`. (993 of 997 shiurim have one recording, so they are identical in practice.) |
| C6 | Item time | `segs[0]` | min of segs; end = max seg's `ends` | **min(segs) → start, max(segs) → end**, recording from `evidence.recordingId` → section's recording → the only recording. Out-of-range seg: drop the time, keep the item, report. Unresolvable section time: shiur becomes catalog-only. |
| C7 | Confidence | drop < 0.6 | drop < 0.6, `soft` 0.6–0.75 | Drop < 0.6; `soft: true` for 0.6–0.75 (in `publish-policy.json`). Quiet may ignore `soft`. |
| C8 | Sources | drop `unresolved` with `work: null`, remap `sourceIdx` | keep all | **Drop `unresolved && work === null`** (nothing displayable) and remap `writeup.paragraphs[].sourceIdx` in the shared projector. `inferred` keeps a flag; Sefaria link-out only for `resolved`. |
| C9 | `candidateTopics` | search keywords only | not published | **Not in any page payload.** Exposed only to `search-core` as low-weight keywords (Pagefind records, D1 rows, embeddings). They are derived data, not transcript, so this is allowed. Never displayed as topics. |
| C10 | Unmapped zman/parsha/work | never fail, report | fail on unmapped zman | **Never fail a data build.** Unmapped → "other" bucket + `build-report.json` + GitHub job-summary warning. A unit test in `normalize` (run on PRs that touch `packages/normalize`) asserts full coverage of today's values. Data commits arrive unattended; a new spelling must not block publishing. |
| C11 | Verbatim guard | report ≥10, fail ≥16 | report ≥14, fail ≥20 | **Report ≥12 tokens, auto-suppress ≥20** (see §5.3). Owner confirms thresholds (O3). Reports carry ids and counts only, never ASR text. |
| C12 | Audio bucket | copy mp3s into separate public-content bucket | Worker over the private bucket with an allow-table | **Superseded by A1: the existing `emunas` bucket, public on `media.<domain>`.** No second bucket, no copy. URLs are built at build time from `audioKey` (`recordings[].audioUrl`); only `.mp3` keys are linked; keys containing `transcripts/` are refused. No Worker has an R2 binding. |
| C13 | Range handling | R2 `get` with `range` → 206 | full 200 + Workers cache slicing | **Superseded by A1: Cloudflare's CDN in front of the R2 custom domain** serves Range (206), HEAD and conditional requests and caches mp3 by default. No Worker code. |
| C14 | Download param | `?download=1` | `?dl=1` | **Superseded by A1: no download parameter.** "Download" is a plain link to the media URL; the `download` attribute is ignored cross-origin, so the file saves under its bucket filename unless the owner sets `Content-Disposition` on the objects. |
| C15 | Audio host | same origin per site | route on each host | **Superseded by A1: one media host `media.<domain>` for both sites.** Plain `<audio src>`; CSP `media-src` allows the media origin. The bucket's CORS rules allow both site origins so Live's service worker can `fetch()` audio for offline downloads. |
| C16 | `@hebcal/core` (GPL-2.0) | build-time only | in the client | **Build-time only, both sites.** `packages/calendar` generates `calendar/table.json` for 5787–5800 (Shabbos → parsha, diaspora + Israel; occasion windows), committed. Runtime `thisWeek(date, {israel})` is our own ~2 KB code over that table, so Live's "Today" stays current without a rebuild and no GPL code ships to browsers. License confirmation is still flagged (O6). |
| C17 | Transcript eligibility file | `apps/quiet/config/…` | `apps/live/config/…` | **One file** `site-policy/transcript-eligibility.json`, entries keyed by recordingId: `{ model, mode, transcribedAt, quality: "reviewed" \| "high-asr", approvedBy, approvedAt, allowSearch: false, note }`. Identity fields must equal the compact transcript's top-level fields, so re-transcription voids approval. Plus build flag `EMUNAS_TRANSCRIPT_VIEW` (default off). Public descriptor per recording: `transcript: { eligible: false }` (literal type today). |
| C18 | Feedback | `mailto:` | `/api/feedback` + D1 | Live uses `/api/feedback` (in `emunas-api`). Quiet keeps `mailto:` at launch (no-JS, no Turnstile); it can post to the same endpoint later. |
| C19 | Search backend | Pagefind only, Worker rejected | D1 + Vectorize Worker + MiniSearch | **Both, as planned per site**, over one `search-core` document definition. The D1/Vectorize Worker is shared infrastructure; Quiet may call it later, but launches static. |
| C20 | Root `/` | edition chooser (static) | redirect by Accept-Language | Each keeps its own: Quiet `/` = chooser page (it is the canonical root); Live `/` = Worker redirect to `/<ui>/` for a `UI_LANGS` language (cookie, then Accept-Language). |
| C21 | Workspace edits | reconciler | reconciler | Done in W1.1 (this plan). |

---

## 2. Domains, URLs, SEO

### 2.1 Decision: one registrable domain, a hostname per site

- **Home** (the landing site, essays and files): `https://<domain>/` (apex; `www` redirects to apex).
- **Quiet is primary and canonical**: `https://library.<domain>/`. It pre-renders every shiur in both editions, works without JS, and is the copy search engines should index.
- **Live**: `https://analyze.<domain>/`. **Media** (R2): `https://media.<domain>/`.
- `<domain>` is `EMUNAS_DOMAIN` (`emunas.com` now, `emunas.com` later); every host derives from it, so moving domains is config only (ops-runbook §3 "Domains and cutover").
- Rejected: **subpaths** (`<domain>/listen/…`) — two frameworks and two Workers on one host means one Worker fronting the other, colliding `/_astro` vs `/assets`, a service-worker scope fight, and Live's SPA fallback swallowing Quiet's 404s. Rejected: **separate registrable domains** — two names for one collection confuses people and splits trust; nothing needs separate cookies.
- Without a domain (and on staging): `emunas-{home,quiet,live}[-staging].<account>.workers.dev`, all `noindex` (header `X-Robots-Tag: noindex` on `*.workers.dev` hosts, set by the site Workers).

### 2.2 Equivalent deep links (`@emunas/links`)

Edition/UI language is the first path segment on both sites (`yi` | `en`). Time is always **global seconds** (C5). Moment ids: `<shiurId>~<kind><index>` (`s3`, `i2`, `q0`, `st1`, `tk4`, `kp0`).

| Thing | Quiet (`library.<domain>`) | Live (`analyze.<domain>`) |
|---|---|---|
| Home | `/{ed}/` | `/{ui}/` |
| Shiur | `/{ed}/shiur/{shiurId}/` | `/{ui}/s/{shiurId}` |
| Section i | `/{ed}/shiur/{id}/#t={sectionStart}` | `/{ui}/s/{id}?t={sectionStart}&m={id}~s{i}` |
| Time t | `/{ed}/shiur/{id}/#t={t}` (player script seeks; without JS the page opens at the top) | `/{ui}/s/{id}?t={t}` |
| Series | `/{ed}/series/{seriesId}/` | `/{ui}/series/{seriesId}` |
| Parsha | `/{ed}/calendar/parsha/{parshaKey}/` | `/{ui}/o/{parshaKey}` |
| Zman | `/{ed}/calendar/zman/{zmanKey}/` | `/{ui}/o/{zmanKey}` |
| Topic | `/{ed}/inyanim/{topicId}/` (+ `all/`) | `/{ui}/t/{topicId}` |
| Work | `/{ed}/sources/{workId}/` | `/{ui}/seforim/{workId}` |
| Person | `/{ed}/people/{personId}/` (+ `all/`) | `/{ui}/p/{personId}` |
| Concept (glossary entry) | `/{ed}/erachim/{conceptId}/` | `/{ui}/c/{conceptId}` (merged into a topic: the topic) |
| Story | `/{ed}/stories/{storyId}/` | `/{ui}/maasios/{storyId}` |
| Thread | none (edition home `#indexes`) | `/{ui}/th/{threadId}` (noindex) |
| Search | `/{ed}/search/?q=` | `/{ui}/search?q=` |
| Audio | `recordings[].audioUrl` on `media.<domain>` (A1; not built by `@emunas/links`) | same URL |

Parsha and zman keys come from `@emunas/normalize`; they share one occasion namespace and are guaranteed disjoint by a test. Topics, concepts, people, works, stories and threads are addressed by their corpus id (corpus-wave-plan §3.5). Whether an entry has a page on a site is the corpus layer's page flag (`pageLookupFromLayer`); a Quiet entry without a page links to its index anchor (`/{ed}/people/#{id}`), a Live one has no link.

Moving between sites: Quiet shiur page has "Open in the listening app" (`links.live.shiur(id, {t: currentTime})`; JS adds the live player time). Live listening room has "In the Library" (`links.quiet.shiur(id)`). Live-only query params (`audio`, `read`, `lens`) are dropped when crossing.

### 2.3 SEO

- Quiet: self-canonical; one `hreflang` alternate per edition (`links.hreflangAlternates`: en, yi, he) + `x-default` → `/`; `sitemap-index.xml` (per edition) built from `.corpus`; OG tags from catalog title + `oneLiner` in the edition's language (with the §2.4 fallback).
- Home (`apps/home`): every page in every language (`UI_LANGS`): English at `/…`, the others at `/{lang}/…` (no `/en/`, no redirects; `apps/home/src/lib/lang-path.ts`). Self-canonical; one `hreflang` alternate per language + `x-default` → the English URL; `og:locale` per language; the sitemap lists every page in every language. A page links Library and Analyze in its own language and lists their other editions.
- Live: prerendered shiur/series/occasion/work/entity pages carry OG tags (share previews) and `<link rel="canonical">` **to the Quiet equivalent**. Today, Explore, search, shelf, playlists: `noindex`. No sitemap. One indexable copy of each shiur, so the two sites do not compete.
- Catalog-only shiurim are indexable (catalog title, section, year); they gain description text when notes land.
- `robots.txt` on both: allow all, disallow `/api/`, `/admin/`. (Audio lives on `media.<domain>`, A1; whether that host gets its own `robots.txt` is the owner's call.)

### 2.4 Languages

The interface languages are one list, `UI_LANGS` in `@emunas/i18n` (`en`, `yi`, `he`; Yiddish and Hebrew right-to-left). Nothing else in the repo lists them: editions (`@emunas/links` `EDS`), message tables (`MessageTables` is a mapped type, so tsc reports a missing language), hreflang, sitemaps, search fields (`title_<lang>`, `body_<lang>`), the API's `ui` parameter and the guard's term lists are all derived from it. A fourth language is a new `UI_LANGS` entry plus its message tables, its style rules and its translations.

Two languages are kept apart:

- **Audio language** (`AudioLang`, `en` | `yi`): the language the Mashgiach spoke in. It is a property of the recording, shown in the citation line, and filtered on. Hebrew is never an audio language.
- **Content language**: the language of the generated text (summaries, sections, stories, Q&A, write-ups, corpus concepts, topics, stories, threads and series). The pipeline writes `en` and `yi` (`SOURCE_LANGS`); every further language (`TranslatedLang`, today `he`) comes from **translation overlays**.

Overlays (contract: `ShiurTranslation`, `CorpusTranslation` and `TRANSLATION_LANGS` in `src/types.ts`; how they are made: [`docs/translation-runbook.md`](../translation-runbook.md)):

- One file per shiur, `data/derived/shiurim/<id>/i18n/<lang>.json`, and any number of corpus parts, `data/derived/corpus/i18n/<lang>/<part>.json`. Keys are paths of the translated text (`x.sections.2.title`, `w.0.paragraphs.1.text`, `concepts:<id>.label`, `series:<id>.arc.<shiurId>.oneLiner`).
- Each file carries the hash of the en/yi text it was made from. `corpus:build` applies an overlay only while that hash matches the current source; a stale one is ignored and counted in `build-report.json` and `layer.json` (`translations`).
- The build writes every generated text as `LocalizedText` (`{ en, yi, he? }`): `he` only where a current translation exists. A Hebrew write-up is published only when the overlay covers every Yiddish heading and paragraph, so a write-up never mixes languages.

**Fallback.** A text with no current translation in the reader's language falls back along one chain, `CONTENT_FALLBACK` in `@emunas/i18n`: he → yi → en, yi → en, en → yi. `pickText` / `pickLocalized` return the text together with the language actually shown, and the element carries that language's `lang` and `dir`, so a Yiddish fallback on a Hebrew page is still marked `lang="yi"`.

**Wording.** Hebrew UI text has no nikud; the Mashgiach is "המשגיח" (formally הגה"צ רבי משה וולפסון זצ"ל), never "הרב" as a stand-in and never שליט"א. When a Yiddish UI word is hard to render in Hebrew, use the Hebrew word.

---

## 3. Cloudflare

### 3.1 Resources

| Resource | Name | Used by | Notes |
|---|---|---|---|
| R2 | `emunas` (exists) | pipeline (write); browsers (read, via `media.<domain>`) | **public custom domain `media.<domain>` with CORS for both site origins (A1); never bound to any Worker.** Holds mp3s and `transcripts/…`; the transcripts are reachable but never linked (accepted by the owner until they are removed from the bucket). |
| R2 | `emunas-site-build` | CI only | embedding cache `emb/<model>/<hash>.f16`; private |
| Worker | `emunas-quiet` | `library.<domain>` | static assets (`dist/`); no audio route (A1) |
| Worker | `emunas-live` | `analyze.<domain>` | static assets (`build/client`), `not_found_handling: "single-page-application"`, `run_worker_first: ["/", "/api/*", "/admin/*"]`, service binding `API` → `emunas-api` |
| Worker | `emunas-api` | via service binding only (`workers_dev: false`, no route) | `/api/search`, `/api/similar`, `/api/feedback`, `/api/health`, `/admin/feedback` |
| D1 | `emunas-search`, `emunas-feedback` (+ `-staging`) | api | separate DBs: rebuildable index vs. user reports that must never be wiped |
| Vectorize | `emunas-moments` (+ `-staging`), 1,024 dims, cosine | api | model gated on the Yiddish eval (bge-m3 vs qwen3-embedding) |
| Workers AI | binding `AI` | api (query embedding), CI (REST, bulk embedding) | |
| Rate limiting | binding `RATE` | api | 30 req / 10 s / IP |
| Turnstile | one widget for `analyze.<domain>` | api feedback | |
| Access | app on `analyze.<domain>/admin/*` | owner | feedback export |
| KV / Durable Objects | none | | sync (D1 or DO) is a later owner decision (O5) |

Workers Paid plan recommended ($5/mo): file-count headroom (Quiet ≈ 8–12k files, Live ≈ 12k), D1/Vectorize/AI usage. Both sites fit under 18,000 files (CI budget fails above).

### 3.2 Audio

Per Amendment A1 (owner decision): audio is served straight from the `emunas` bucket on `media.<domain>`. There is no audio Worker, no `/audio/*` route, no copy CLI or `audio-publish` workflow, and no `AUDIO_ENABLED` switch.

- **URL**: `recordings[].audioUrl = ${MEDIA_ORIGIN}/${encodeURIComponent(segment)…}` of the recording's `audioKey` (each `/`-separated segment encoded; spaces, `#`, Hebrew all survive). `MEDIA_ORIGIN` is build config: env `EMUNAS_MEDIA_ORIGIN` (or `corpus:build --media-origin`); unset → the placeholder `https://media.example.invalid` plus a build-report warning. `build.json` records `mediaOrigin` for the apps' CSP. The raw `audioKey` field never reaches public output.
- **Playability**: only `.mp3` keys (any case) are linked. Other recordings (3 `.WMA` today) are `playable: false, audioUrl: null` and both sites show them as unavailable. Keys containing `transcripts/` are refused outright.
- **Duplicates**: a recording with `duplicateOf` gets its canonical recording's URL.
- **Audio table** (`.corpus/audio-table.json`, `recordingId → {url, canonicalId, playable, size}`) is built by `@emunas/audio` `buildAudioTable` during `corpus:build`, for apps that want a lookup (e.g. Live offline downloads, size estimates).
- **Range, caching, CORS**: Cloudflare's CDN in front of the R2 custom domain handles Range/206, HEAD and conditional requests and caches mp3 by default (no egress; only cache-miss Class B reads). The owner sets the bucket's CORS AllowedOrigins to both site origins; both sites' CSP `media-src` (and Live's `connect-src`, for the service worker) allow the media origin.
- **Downloads**: a plain link to `audioUrl`. The `download` attribute is ignored cross-origin, so the file saves under its bucket filename unless the owner sets `Content-Disposition` on objects.

### 3.3 Caching

| Path | Cache-Control |
|---|---|
| `/_astro/*`, `/assets/*`, `/fonts/*` | `public, max-age=31536000, immutable` (hashed) |
| HTML | platform default (revalidate) |
| Live `/data/*` (stable paths) | `public, max-age=300, stale-while-revalidate=86400` |
| `/pagefind/*` | `public, max-age=3600` (hashed fragments are immutable) |
| `media.<domain>` (audio, A1) | Cloudflare default for the R2 custom domain (mp3 cached); not set by site code |
| `/api/search` | Cache API in api Worker, key = query + filters + `corpus_rev`, 10 min |

### 3.4 Environments

| Env | Deployed from | Sites | api bindings |
|---|---|---|---|
| production | `main` (push, daily cron, dispatch) | `<domain>`, `library.<domain>`, `analyze.<domain>` | prod D1/Vectorize |
| staging | manual dispatch (api schema changes, search tuning) | `*-staging` workers.dev | `-staging` D1/Vectorize, `emunas-api-staging` |
| preview | every same-repo PR: `wrangler versions upload --preview-alias pr-<n>` | per-PR preview URL, `noindex` | staging bindings (so a PR can never write prod D1) |

Each `wrangler.jsonc` has a top-level (production) config and `env.staging`. `compatibility_date` pinned at implementation. Worker secrets: `TURNSTILE_SECRET`, `FEEDBACK_HASH_SALT` (api). GitHub secrets: `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, Vectorize, Workers AI, R2 on `emunas-site-build` only), `CLOUDFLARE_ACCOUNT_ID`. CI never holds credentials to `emunas` (A1: audio URLs are computed from `ingest.json`, nothing is copied), and the build never reads R2.

### 3.5 CI/CD (GitHub Actions)

- `ci.yml` (PRs): `npm ci` → typecheck (pipeline `npm run typecheck` too) → lint → unit tests → `corpus:build` on the real `data/` → guard pre-pass → the three app builds (Quiet, Live, Home) → guard post-pass → budgets → Playwright smoke (`wrangler dev`) → preview uploads.
- `deploy.yml` (push to `main` touching `data/derived/**`, `data/catalog/**`, `apps/**`, `packages/**`, `workers/**`, `site-policy/**`; dispatch): same build (with `EMUNAS_MEDIA_ORIGIN` set) → D1 migrations → D1 incremental sync → Vectorize incremental sync → deploy `emunas-api` → deploy `emunas-quiet` → deploy `emunas-live`. `concurrency: deploy-production, cancel-in-progress: true` (syncs are hash-diffed and idempotent, so cancelling is safe). Caches: `actions/cache` for `.corpus/` fingerprints, `.astro`, embedding cache is in R2.
- `refresh-quiet.yml` (every second day at 05:17 UTC; dispatch): Quiet only, from `main`: corpus build → guard pre → rebuild with suppress → search build → Quiet build → `_headers` → guard post over `.corpus` and `apps/quiet/dist` → budgets → deploy `emunas-quiet`. It keeps the title page's "this week" window current. It shares the `deploy-production` concurrency group without cancelling, so a full deploy cancels a refresh and never the other way round.
- The checkout includes `data/transcripts` (it is in git) only because the guard reads it; no other step does.
- Rollback: `wrangler rollback` per Worker; D1 search is rebuildable; feedback D1 is never touched by deploys.

---

## 4. Data publish flow

```
pipeline work → commits data/derived/** on a working branch
      │  (pull request → main)
      ▼
deploy.yml on main
  1. corpus:build     ingest + manifest + catalog + shiurim/*/{meta,extraction,writeup}  → .corpus/
                      + translation overlays shiurim/*/i18n/<lang>.json, corpus/i18n/<lang>/*.json (§2.4)
                      (status gate C4, projection, time, normalize keys, aggregates, build-report.json)
  2. guard pre-pass   reads data/transcripts (CI only) vs .corpus text → .corpus/suppress.json (ids only, ≥20-token runs)
  3. corpus:build --suppress .corpus/suppress.json   (re-projects only affected shiurim; fingerprints)
  4. quiet build      .corpus → pages + Pagefind      live build   .corpus → /data/*.json + prerender
     search rows      .corpus → D1 NDJSON + vector inputs (search-core)
  5. guard post-pass  forbidden keys/substrings + n-gram scan over dist/, build/client/, NDJSON, vector metadata,
                      Worker bundles → must be zero findings at ≥20 tokens, else FAIL (nothing deploys)
  6. budgets          file counts, file sizes, page/JSON sizes
  7. deploy           D1/Vectorize diff sync → api → quiet → live
  8. job summary      "N of 997 with notes", newly full shiurim, downgraded shiurim + reasons,
                      unmapped strings, suppressed ids (no text)
```

- **New data appears automatically**: a shiur flipping to `done` changes its fingerprint → full page, indexes, counts, search rows and vectors on the next run. No hand-kept lists.
- **Manifest is the source of truth, files are not** (the partial `-01-c` directory stays catalog-only).
- **Translations** arrive the same way (translation sessions commit `data/derived/**/i18n/**`). A reprocessed shiur's overlay goes stale and drops out until it is translated again; its readers see the Yiddish meanwhile.
- **Reprocessing** (new `promptVersion`) changes content at the same URLs; moment ids may shift, so every link also carries `t` and Live falls back to `t` on a dangling `m`.
- **What fails a deploy**: invalid `ingest.json`/`manifest.json`, guard post-pass findings, budget overrun, code errors. **What never fails it**: a malformed shiur file, an unmapped string, a verbatim hit (auto-suppressed and reported).
- **Branch**: production builds from `main`. Pipeline data reaches `main` through a pull request from the working branch, like any other change (O9).
- **Future better transcripts**: the pipeline re-runs P4/P4b (`reset-changed.ts`); the site rebuilds as above. Turning on a transcript view for a recording is a human edit to `site-policy/transcript-eligibility.json` + `EMUNAS_TRANSCRIPT_VIEW=on`, reviewed in a PR. Only then does `transcript-gate.ts` emit `transcript/<recordingId>.json` and the guard allow exactly those files. `allowSearch` stays a separate later decision.

---

## 5. The shared data layer in detail

### 5.1 `.corpus/` output (gitignored, consumed by both apps)

```
.corpus/
  build.json            { buildId, dataSha, schemaVersion, mediaOrigin, counts: {total, full, catalogOnly, downgraded} }
  shiurim/<id>.json     PublicShiur (below), one per in-scope shiur (997)
  index.json            list rows for all shiurim (catalog fields, oneLiner, duration, status, entity ids)
  sections.json, neighbours.json, series.json, occasions.json, years.json
                        catalog aggregates (W2.1)
  works.json            the works pages' reference-order layout, each entry keyed by its corpus `workId`
  layer/                corpus layer (corpus-wave-plan §3.3): layer.json, topics.json, concepts.json,
                        people.json, works.json, stories.json, threads.json, series/<id>.json,
                        shiur/<shiurId>.json, synonyms.json, occasion-topics.json
  search/               docs.ndjson, moments.ndjson, entities.ndjson (search-core allow-list; keywords
                        are topic labels and aliases)
  audio-table.json      recordingId → { url, canonicalId, playable, size }   (A1; url null when not playable)
  build-report.json     downgrades, unmapped values, dropped items, time warnings, suppressed ids
  suppress.json         from guard pre-pass (ids only)
  .fingerprints.json    per shiur sha256(manifest entry + meta + extraction + writeup + catalog row + maps/projector versions)
```

### 5.2 Public contract (`@emunas/corpus/public`, sketch)

```ts
type Ed = "yi" | "en";                // the audio language (AudioLang)
type L = LocalizedText;               // { en, yi, he? } from @emunas/i18n (§2.4); the corpus exports LocalizedText itself
interface PublicRecording { id: string; order: number; offset: number; duration: number;
  audioUrl: string | null /* media.<domain> URL (A1); null when !playable */; playable: boolean;
  transcript: { eligible: false } }
type Moment = { id: string; text: L; t: number; end: number; soft?: true };
interface PublicShiur {
  id: string; rev: string; lang: Ed; category: Shiur["category"];
  catalog: { source: CatalogSource; sectionId: string; sectionTitle: string; n: string | null; page: number | null;
             titleOriginal: string; subTitle: string | null; heading?: string; derived: DerivedFrom; note: string | null;
             topics: string[] /* meta.catalogTopics */ };
  parsha: { raw: string; key: string } | null; zman: { raw: string; key: string } | null;
  perek: string | null; years: number[]; series: { id: string; order: number; count: number } | null;
  pathNotes: string[]; duration: number; recordings: PublicRecording[];
  status: "full" | "catalog-only";
  notes?: {                        // only when status === "full"
    summary: { oneLiner: L; abstract: L; keyPoints: Moment[] };
    chapters: { idx: number; t: number; end: number; title: L; summary: L; kind: SectionKind;
                catalogTopicIdx: number[]; sub: { title: L; summary: L; t: number }[]; soft?: true }[];
    skip: [number, number, SectionKind | "pause"][];      // seconds only
    sources: { idx: number; work: string | null; workKey: string | null; ref: string | null; sefariaRef: string | null;
               resolution: "resolved" | "inferred" | "unresolved"; mention: "quoted" | "paraphrased" | "alluded"; t: number }[];
    insights: Moment[]; takeaways: Moment[];
    questions: { id: string; q: L; a: L; tq: number; ta: number; soft?: true }[];
    stories: { id: string; title: L; retelling: L; t: number | null; end: number | null; soft?: true }[];
    // No people or concept names, and no story people: raw extraction names may be ASR mishearings.
    // People, concepts, works and a story's people come from the corpus layer: the shiur's refs in
    // `.corpus/layer/shiur/<id>.json` (personIds, conceptIds, merged story ids) and the entity files.
    writeup: Localized<{ sectionIndex: number; heading: string | null;   // en, yi; he only when fully translated
                          paragraphs: { text: string; src: number[]; t: number; end: number }[] }[]>;
  };
}
```

Never present (type test + guard): `heardAs`, `asrNotes`, `segs`, `startSeg`, `endSeg`, `questionSegs`, `answerSegs`, `segments`, `transcriptKey`, `audioKey`, `asrModel`, `model`, `variant`, `noise.types`. The projector **copies allowed fields** (never strips), so a field the pipeline adds later is unpublished until mapped on purpose.

### 5.3 Leak guard (`@emunas/corpus-guard`)

- **Keys**: the list above; **substrings**: `transcripts/`, `input.txt`, `.vtt`, `audits/`.
- **Verbatim**: per shiur, tokenize transcript segments and every shipped text (NFC, strip nikud U+0591–U+05C7, unify quote marks, Unicode letters/digits, lowercase). Report ≥12-token shared runs; ≥20 → item id into `suppress.json` (pre-pass) / failure (post-pass). `site-policy/verbatim-allow.json` lists item ids a person accepted (pesukim etc.). Reports hold ids, field names and lengths, never the text.
- **Scope**: `.corpus/`, `apps/quiet/dist/`, Pagefind records (checked before `writeFiles`), `apps/live/build/client/`, D1 NDJSON, Vectorize metadata, Worker bundles.
- **Import boundaries** (ESLint + test): `apps/**` cannot import `@emunas/corpus/build`'s raw loaders, `node:fs` in browser code, or any `data/` path; only `transcript-gate.ts` and `corpus-guard` may contain the string `data/transcripts`.

---

## 6. Owner decisions (defaults in bold)

| # | Decision | Default |
|---|---|---|
| O1 | Transcript text or `heardAs` in a hidden search index | **No** |
| O2 | Public audio at all; free downloads | **Decided (A1): public**, straight from `media.<domain>`; downloads are plain links (bucket filename unless `Content-Disposition` is set on objects) |
| O3 | Verbatim thresholds (report 12, suppress 20) and whether short pesukim runs count as "verbatim quotes" | **As stated**; owner reviews the first report |
| O4 | Who approves transcript eligibility | Pipeline owner, by PR to `site-policy/` |
| O5 | Accounts / sync for Live | **Local-only** first |
| O6 | `@hebcal/core` GPL-2.0 at build time only | **Accept** (generates a data table; no code shipped); fallback hand-made table |
| O7 | `current` (79) and `simcha` (72) in general browse | Own sections; excluded from Today/Explore defaults (`publish-policy.json`) |
| O8 | Domain name | `<domain>` apex = home, `library.<domain>` = Quiet, `analyze.<domain>` = Live, `media.<domain>` = R2 |
| O9 | Pipeline branch vs `main` | **Pull request** from the working branch to `main` |
| O10 | Embedding model | bge-m3 unless the Yiddish eval says otherwise |

---

## 7. Implementation plan (waves)

Rules for every package: an agent touches only its listed paths; never `data/`, `scripts/`, `src/`, `config/`; does not commit `package-lock.json` (lists deps in its own `package.json`; the wave merger regenerates the lockfile). Fixtures contain derived text only, never transcript text (guard tests use synthetic transcripts). Wave-1 packages code against the contracts in §1–§5 of this document, so they can run in parallel with the scaffold; the scaffold is merged first within the wave.

### Wave 1 — monorepo scaffold and shared packages

| id | title | paths | deps | acceptance |
|---|---|---|---|---|
| W1.1 | Monorepo scaffold | root `package.json` (workspaces + `site:*` scripts only), `package-lock.json`, `.gitignore` (append), `packages/config/**`, `apps/{quiet,live}/package.json` + hello skeletons, `workers/api/` skeleton, `site-policy/**`, `.github/workflows/ci.yml` (typecheck/lint/test only) | — | `npm ci && npm run site:typecheck && npm run site:test` pass; pipeline `npm run typecheck` unchanged; both apps build a hello page; eligibility file is `{"policyVersion":1,"eligible":{}}` |
| W1.2 | `@emunas/corpus` core | `packages/corpus/**` except `src/aggregate/**` | (contract) | status gate, projection, time model, moment ids, transcript gate, `corpus:build`; on real data: 997 shiurim, 518 full, `-01-c` catalog-only; zero forbidden keys; < 30 s |
| W1.3 | `@emunas/normalize` | `packages/normalize/**` | — | all 56 parsha + 61 zman strings mapped or explicit "other"; disjoint occasion keys; folding and gematria tests; Sefaria ref parser over all current refs |
| W1.4 | `@emunas/calendar` | `packages/calendar/**` | — | committed table 5787–5800; `thisWeek` correct on 10 fixed dates (diaspora/Israel, combined parshiyos, leap years); no hebcal in runtime export |
| W1.5 | `@emunas/audio` | `packages/audio/**` | — | (superseded by A1 / W2.8) media URL encoding, audio table, playability rule; tests on real ingest keys |
| W1.6 | `@emunas/corpus-guard` | `packages/corpus-guard/**` | — | planted `heardAs` and planted 20-token synthetic run fail; ids-only reports; full-corpus run < 2 min |
| W1.7 | `@emunas/i18n` + `@emunas/tokens` | `packages/i18n/**`, `packages/tokens/**` | — | typed `createT`; Hebrew year/duration formatting; font subset coverage test (U+05D0–05EA, 05F0–05F4, FB1D–FB4F, 0591–05C7) |
| W1.8 | `@emunas/links` | `packages/links/**` | — | round-trip tests for every row of §2.2; canonical/hreflang helpers |

### Wave 2 — shared aggregation/search, app shells, infrastructure

W2.1 corpus aggregates (`packages/corpus/src/aggregate/**`), W2.2 `search-core`, W2.3 Quiet design shell, W2.4 Live shell, W2.5 Live player engine, W2.6 `emunas-api` Worker, W2.7 site Workers + wrangler + deploy workflows.

### Wave 3 — pages and site data

Quiet: W3.1 catalog pages, W3.2 shiur page + player, W3.3 calendar + years, W3.4 AI indexes, W3.5 Pagefind search. Live: W3.6 static data emit (to the W2.4 data contract), W3.7 listening room, W3.8 Today + series, W3.9 personal store + shelf + queue, W3.10 D1/Vectorize sync + embedding eval. Ops: W3.11 Cloudflare provisioning + media domain/CORS.

### Wave 4 — browse, search UI, SEO, cross-site

W4.1 Live Explore + lenses, W4.2 Live seforim/maasios/entities, W4.3 Live command bar, W4.4 Live neighbours, W4.5 Live prerender + SEO, W4.6 Quiet SEO + cross-site links, W4.7 Live feedback UI, W4.8 Live PWA/offline (removed).

### Wave 5 — hardening

W5.1 end-to-end test matrix + a11y + Lighthouse + search eval, W5.2 transcript-view scaffolding (OFF) in both sites, W5.3 copy (About texts).

### Wave 6 — launch

W6.1 launch review and owner decisions.

Full briefs, inputs and acceptance criteria for every package are in §8.

## 8. Work packages (full briefs)

Same ids as the wave lists in §7 and the structured plan. Paths are the only files a package may change. No package depends on another package in the same wave; where a same-wave contract is needed it is fixed in this document or owned by an earlier wave (e.g. the Live data contract in W2.4).

### Wave 1

#### W1.1 — Monorepo scaffold (npm workspaces, config, app/worker skeletons, site-policy, CI skeleton)

- **Owns:** `package.json (add workspaces + site:* scripts only)`, `package-lock.json`, `.gitignore (append .corpus/, dist/, build/, .wrangler/)`, `packages/config/**`, `apps/quiet/package.json`, `apps/quiet/astro.config.ts`, `apps/quiet/src/pages/index.astro`, `apps/live/package.json`, `apps/live/react-router.config.ts`, `apps/live/vite.config.ts`, `apps/live/app/root.tsx`, `apps/live/app/routes.ts`, `workers/api/package.json`, `workers/api/src/index.ts`, `site-policy/**`, `.github/workflows/ci.yml`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: docs/sites/integration-plan.md §1, root package.json/tsconfig.json. Add "workspaces": ["packages/*","apps/*","workers/*"] to root package.json without touching existing scripts or dependencies; add site:typecheck/site:test/site:lint/site:build/corpus:build scripts. Create @emunas/config with tsconfig.base.json (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, verbatimModuleSyntax, moduleResolution bundler), ESLint flat config (no-restricted-imports for data/ paths and @emunas/corpus/build from apps/**/src and apps/live/app; no-restricted-syntax for the literals 'data/transcripts', 'input.txt', 'audits' except in packages/corpus/src/transcript-gate.ts and packages/corpus-guard), Stylelint config banning physical properties, vitest base. Hello-page skeletons: Astro static (apps/quiet) and React Router 7 ssr:false (apps/live), plus an empty workers/api fetch handler. site-policy/: transcript-eligibility.json {"policyVersion":1,"eligible":{}}, publish-policy.json (confidence 0.6, soft 0.75, category visibility for current/simcha, suppress [], allowVerbatim []), verbatim-allow.json []. ci.yml: npm ci, pipeline typecheck, site typecheck, lint, test. Pin exact versions (newest release ≥2 weeks old). Deliverables: working workspace + regenerated lockfile.
- **Acceptance:** npm ci, npm run typecheck (pipeline, unchanged), npm run site:typecheck, site:lint, site:test all pass; both hello apps build; git diff shows no change under data/, scripts/, src/, config/, prompts/ and root package.json diff is limited to workspaces + new site:* scripts; ESLint test proves an apps/ file importing data/ or containing 'data/transcripts' fails lint.

#### W1.2 — @emunas/corpus core: loader, status gate, allow-list projection, time model, transcript gate, corpus:build CLI

- **Owns:** `packages/corpus/** (except packages/corpus/src/aggregate/**)`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: src/types.ts (import relatively, read-only), data/derived/{ingest,manifest}.json, data/derived/shiurim/<id>/{meta,extraction,writeup}.json, data/catalog/*.json, site-policy/*.json; integration-plan §1.4 C4–C9/C17, §5.1–5.2. Subpath exports: ./public (browser-safe PublicShiur types, toLocal/toGlobal timeline helpers, moment-id helpers, entity thresholds constants) and ./build (Node). Allow-listed file reader (regex allowlist; throws on transcripts/input.txt/audits). valibot schemas mirroring src/types.ts. Status gate = manifest done AND three files parse+validate AND writeup.extractionVariant==='extraction' AND structural checks; else catalog-only + report entry, never throw (only invalid ingest/manifest is fatal). Field-by-field projection (copy allowed, never strip); confidence drop <0.6, soft 0.6–0.75 from publish-policy; drop unresolved sources with work null and remap writeup sourceIdx; time = min(segs) start / max(segs) end via meta starts/ends, recording resolution order evidence.recordingId → section recording → only recording; global seconds with recording offsets; noise[] → skip ranges in seconds. Key fields (parsha.key, zman.key, workKey, personKey, conceptKey) via an injected normalizer interface `Keyer` (default identity-slug implementation; W2.1 wires @emunas/normalize). transcript-gate.ts: readEligibleTranscript(recId) returns null unless eligibility entry identity matches the compact transcript AND EMUNAS_TRANSCRIPT_VIEW==='on'. CLI `corpus:build [--data-dir] [--out .corpus] [--suppress file]` writing build.json, shiurim/<id>.json, index.json, audio-table.json, build-report.json, fingerprints (rewrite only changed). Fixtures: projected outputs of the 7 sample shiurim (yi-parshas-hashavua-brshys-01, en-parsha-en-nch-01, yi-zmanim-lvl-01, yi-zmanim-tv-bb-04, en-miscellaneous-en-01, yi-tanya-1-01, yi-zmanim-msybs-lchyym-bkmp-01-c) + a 60-shiur mini corpus, derived text only.
- **Acceptance:** On today's data: 997 shiurim emitted, full count equals manifest done count minus downgrades (518 today), yi-zmanim-msybs-lchyym-bkmp-01-c and yi-tanya-1-01 are catalog-only, yi-zmanim-tv-bb-04 has 2 recordings with correct offsets; property tests over all real shiurim: chapters monotonic and tiling, every t within [0,duration], writeup t inside its section; type test: keyof public types never includes heardAs/asrNotes/segs/startSeg/endSeg/questionSegs/answerSegs/transcriptKey/audioKey/asrModel; poisoned fixture with extra unknown field + heardAs is not in output; transcript-gate returns null with empty eligibility and on identity mismatch; full build < 30 s, unchanged rerun rewrites 0 shiur files.

#### W1.3 — @emunas/normalize: folding, alias tables, stable keys, Sefaria ref parser, gematria

- **Owns:** `packages/normalize/**`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: distinct values from data/derived/ingest.json (parsha 56, zman 61) and extraction.json (work, people, concepts.he, sefariaRef) — read by a dev-only script inside the package that writes seed tables; integration-plan C10, §2.2. Deliverables: fold()/normalizeHe() (NFC, strip U+0591–U+05C7, unify ״”“" and ׳’', ־/-, lowercase Latin, whitespace) + transliteration variant table; parsha table (54 sedros + combined; key, chumash, order, yi/en/he labels, catalog spellings, hebcal name); occasions/zmanim table (ordered from Elul, aliases, seudah sub-heading mapping, Hebrew-calendar window per occasion, 'other' bucket); works table (alias → workKey, group Torah/Nevi'im/Kesuvim/Mishnah/Bavli/Yerushalmi/Midrash/Zohar/Rishonim/Acharonim+Chassidus, order, yi/en/he names, Sefaria index title, ordering scheme, genre flag); people and concepts alias tables + concept stop-list; Sefaria ref parser (book/chapter/verse, daf/amud) and books table; Hebrew year gematria ↔ number; key functions that never throw (unmapped → deterministic slug + reported). All tables reviewStatus 'unreviewed'. Pure, browser-safe.
- **Acceptance:** Test: every parsha and zman string in today's ingest maps to a key or is explicitly listed as other; parsha and zman keys are disjoint; ל"ג בעומר / ל”ג בעומר / lag baomer fold equal; gematria round-trips 5724–5800; all current sefariaRef strings parse or are classified; works with ≥2 shiurim have group + order; obvious people duplicates (Dovid/David HaMelech, Ramban/the Ramban) merge.

#### W1.4 — @emunas/calendar: build-time hebcal table + runtime thisWeek()

- **Owns:** `packages/calendar/**`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: integration-plan C16. @hebcal/core as devDependency used only by a generator script that writes packages/calendar/table/5787-5800.json (each Shabbos: civil date, parsha diaspora + Israel incl. combined, holiday/occasion windows using occasion ids from the agreed key scheme; ids are plain strings so no import of normalize is required, a later test cross-checks). Runtime export (no hebcal import): thisWeek(date, {israel}) → {parshaKey(s), upcomingOccasions[], hebrewDate}, nearestOccasion(). Record the license note in the package README.
- **Acceptance:** thisWeek correct for 10 fixed dates covering combined parshiyos, leap year, Israel vs diaspora divergence, Chanukah, Lag BaOmer; bundle-analysis test proves the runtime entry imports nothing from @hebcal/*; table is committed and regenerable deterministically.

#### W1.5 — @emunas/audio: media URLs, audio table, playability rule

- **Owns:** `packages/audio/**`
- **Depends on:** — (contracts in this document)
- **Status:** first built as an edge handler + publish CLI (emunas → emunas-audio); **superseded by Amendment A1 and reworked in W2.8**. The handler, publish CLI, R2/S3 dependencies and their tests were removed.
- **Brief (inputs, deliverables), as reworked:** Inputs: Amendment A1, §3.2; Recording type. Deliverables: `mediaUrl(audioKey, origin)` (origin + per-segment `encodeURIComponent`; refuses keys with `transcripts/`, empty/`.`/`..` segments, control characters); `normalizeMediaOrigin`; playability rule (`.mp3` in any case; `.WMA` etc. unplayable); `buildAudioTable(recordings, {origin, only, onIssue})` → `recordingId → {url, canonicalId, playable, size}` with `duplicateOf` → canonical URL; `mediaTimeUrl(url, t)` for no-JS `#t=` links. Pure, no dependencies. `@emunas/corpus` calls it in `corpus:build`.
- **Acceptance:** encoding round-trips on real keys with spaces, Hebrew and `#`; duplicates map to the canonical URL; `.WMA` unplayable; the table over the real ingest covers every in-scope recording (1,000 playable, 3 `.WMA`); no `@aws-sdk` or R2 binding in the package.

#### W1.6 — @emunas/corpus-guard: leak scanner and verbatim suppression

- **Owns:** `packages/corpus-guard/**`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: integration-plan §0, §5.3, C11; data/transcripts/*.json (only this package and transcript-gate may read them). CLI modes: `guard pre --corpus .corpus --transcripts data/transcripts --out .corpus/suppress.json` (ids of items with ≥20-token shared runs, report ≥12) and `guard post --scan <dirs/files...>` (forbidden keys: heardAs, asrNotes, segments, segs, startSeg, endSeg, questionSegs, answerSegs, transcriptKey, audioKey; substrings transcripts/, input.txt, .vtt, audits/; verbatim n-gram scan of all text in JSON/HTML/NDJSON/JS bundles mapped back to shiur by id where possible, else against the whole corpus shingle set; allow /transcript/<id>.json only for eligible ids). Tokenizer: NFC, strip nikud, unify quotes, Unicode letters/digits, lowercase. Honours site-policy/verbatim-allow.json. Reports contain ids, field names, run lengths — never text. Exit non-zero on post findings. Also exports a Pagefind-record checker and budget helpers (file count ≤18,000, max file 25 MiB).
- **Acceptance:** Fixture tests with a synthetic transcript: planted heardAs key fails; planted 20-token run fails post and appears in pre suppress list; 11-token run passes silently; allow-listed id passes; report files contain no transcript tokens (test greps report for the synthetic sentence); full-corpus pre-pass on real data < 2 min and its counts are printed.

#### W1.7 — @emunas/i18n and @emunas/tokens

- **Owns:** `packages/i18n/**`, `packages/tokens/**`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: integration-plan §1.3; concept docs §8/§7 (tone, RTL). i18n: createT<Keys>(tables) with a typed key union (missing key = type error), Intl.PluralRules for yi/en, formatDuration, formatHebrewYear(5743) → תשמ"ג (1982–83) (gematria implemented locally or via a tiny shared helper; no dependency on normalize to avoid cycles—normalize may re-export), scriptOf(text) → he|latin|mixed and langFor(text, shiurLang) for lang/dir attributes, shared data-vocabulary labels in en/yi: categories, section kinds, source resolution wording (resolved / 'apparently' / 'place not identified'), audio language, the standing AI-notes label, catalog-derived notice. tokens: CSS custom properties (type scale, spacing, radii, semantic colour roles light/dark incl. paper/ink), @font-face for self-hosted subset woff2 (Frank Ruhl Libre, Source Serif 4, one sans for Live UI e.g. Noto Sans Hebrew + a Latin sans, all OFL), subset script with fonttools.
- **Acceptance:** Type test: t('missing') fails tsc; Hebrew year and duration snapshots in both languages; scriptOf handles 'The קדושה of צדיקים'; font coverage test passes for U+05D0–05EA, U+05F0–05F4, U+FB1D–FB4F, U+0591–05C7 and transliteration Latin (ḥ, ’); total woff2 ≤ 220 KB across all faces.

#### W1.8 — @emunas/links: cross-site URL builders, canonical and hreflang

- **Owns:** `packages/links/**`
- **Depends on:** — (contracts in this document)
- **Brief (inputs, deliverables):** Inputs: integration-plan §2. Host config (production apex/listen hosts from env, workers.dev fallbacks). Builders: quiet.{home,shiur(id,{section,t}),series,parsha,zman,work,person,concept,search}, live.{home,shiur(id,{t,m}),series,occasion,work,person,concept,search} (audio URLs are not built here: they come from `recordings[].audioUrl`, A1); equivalent(url) parser that maps any URL of one site to the other (dropping live-only params; quiet entity fallback to index anchor below thresholds given an entity-count lookup); canonicalFor(liveUrl) → quiet URL; hreflangPair(path). Pure, browser-safe.
- **Acceptance:** Round-trip tests for every row of the §2.2 table in both editions; equivalent(quiet→live→quiet) is identity for shiur/section/time/series/occasion/work/person/concept; below-threshold entity maps to index anchor; canonicalFor never returns a analyze.* URL.

### Wave 2

#### W2.1 — Corpus aggregates wired to normalize

- **Owns:** `packages/corpus/src/aggregate/**`, `packages/corpus/src/keyer-normalize.ts`
- **Depends on:** W1.2, W1.3
- **Brief (inputs, deliverables):** Inputs: W1.2 projection, W1.3 tables. Wire @emunas/normalize as the Keyer. Emit into .corpus/: series.json (ordered parts, Tanya grouped by perek, yi/en sibling links), occasions.json (parsha/zman → shiur ids both languages sorted by year, seudah sub-headings, uncatalogued guesses excluded), years.json (+ unknown lane count), works.json (work → refs in traditional order → [shiurId, t]), people.json, concepts.json (stop-list, threshold), stories.json (without retelling), entities.json (counts used for page thresholds Quiet ≥2/≥3, Live ≥3 prerender), catalog neighbours (prev/next in section and series). Unmapped values go to build-report.
- **Acceptance:** Golden tests on the mini corpus; on real data every in-scope shiur appears in exactly one section listing; occasions merge both languages; undated count equals shiurim with empty hebrewYears; works order matches the table; build-report lists unmapped strings without failing.

#### W2.2 — @emunas/search-core: indexed-field allow-list and query normalization

- **Owns:** `packages/search-core/**`
- **Depends on:** W1.2, W1.3
- **Brief (inputs, deliverables):** Inputs: integration-plan C9, C19; PublicShiur. Defines SearchDoc (shiur level: titleOriginal, heading, subTitle, parsha/zman labels, Hebrew year, catalog topics, oneLiner/abstract/keyPoints en+yi, section titles+summaries, story titles, question text, source work/ref, people names, concepts, candidateTopics as low-weight keywords) and MomentRow (section, insight, question, takeaway, story, keypoint, writeup paragraph; id, shiurId, kind, t, end, lang, title_en/yi, body, entity ids, facets, hash = sha256(schemaVersion+text+metadata)). Writes .corpus/search/docs.ndjson and moments.ndjson. normalizeQuery(q) = fold + alias expansion (shared by Pagefind glue, MiniSearch and the api Worker). No transcript-derived field can be referenced (type-level).
- **Acceptance:** Tests: output field set equals the allow-list exactly; candidateTopics present only in keyword field; hashes stable across runs; 'לג בעומר' and 'lag baomer' normalize to overlapping token sets; corpus-guard post-pass on the NDJSON is clean.

#### W2.3 — Quiet design shell

- **Owns:** `apps/quiet/src/styles/**`, `apps/quiet/src/layouts/**`, `apps/quiet/src/i18n/**`, `apps/quiet/src/lib/**`, `apps/quiet/src/components/{TimeLink,HebrewYear,Coverage,NotesLabel,CatalogHeader,Listen}.astro`, `apps/quiet/public/{fonts/**,favicon.svg}`
- **Depends on:** W1.1, W1.7, W1.8
- **Brief (inputs, deliverables):** Inputs: concept-quiet §3, §8, §11; tech-quiet §4; @emunas/tokens, @emunas/i18n, @emunas/links. Base layout with html lang/dir per edition, one-line nav (Contents · Calendar · Indexes · Search · About) + edition switch keeping the hash, breadcrumb, footer, skip link; print layer (kuntres); bidi helpers; the shared components listed (TimeLink renders href={audioUrl}#t={local} via toLocal + mediaTimeUrl plus data-rec/data-t; CatalogHeader with <bdi> and catalog-derived notice; Listen with native <audio preload=none src={audioUrl}> per recording and "not available online" text for playable:false recordings). Logical CSS only, no blockquote/q.
- **Acceptance:** A sample page renders correctly in both editions (screenshot), Stylelint logical-properties clean, axe zero violations on the sample, print preview hides nav/player, edition switch preserves path and hash.

#### W2.4 — Live app shell

- **Owns:** `apps/live/app/root.tsx`, `apps/live/app/routes.ts`, `apps/live/app/shell/**`, `apps/live/app/i18n/**`, `apps/live/app/styles/**`, `apps/live/app/components/Text.tsx`, `apps/live/public/{fonts,icons}/**`, `apps/live/app/routes/** (stubs only)`, `apps/live/app/data/** (public/data file types, loaders, fixtures built from @emunas/corpus fixtures)`
- **Depends on:** W1.1, W1.7, W1.8
- **Brief (inputs, deliverables):** Inputs: concept-live §4, §7; tech-live §1 (rendering, routing), §2. React Router 7 framework mode ssr:false + prerender, :ui segment ∈ {en,yi} setting html lang/dir, rail + reserved dock slot (height reserved), route stubs for every route in tech-live §1 (Today, s/:id, explore, seforim, maasios, series, p/c/o, search, shelf, pl), focus to h1 on navigation, <Text value lang> bidi component, UI string tables via createT, language settings (UI / audio filter / reading language) in a Zustand store + query string, CSS Modules on @emunas/tokens with logical properties, react-aria-components. Also defines the Live data contract: TS types for every /data/* file in tech-live §3.3 (using the integration-plan PublicShiur), typed clientLoader fetch helpers, and fixture files generated from @emunas/corpus fixtures so wave-3 UI work does not wait for the real emitter.
- **Acceptance:** en and yi render mirrored (screenshot diff); axe clean on all stubs; no physical CSS properties (stylelint); client navigation between all stubs works with a persistent element mounted in the dock slot (test proves it is never remounted). Data contract types compile against @emunas/corpus/public and fixtures load through the loaders.

#### W2.5 — Live player engine

- **Owns:** `apps/live/app/player-engine/**`
- **Depends on:** W1.2
- **Brief (inputs, deliverables):** Inputs: tech-live §4.1; PublicShiur recordings/chapters/skip from @emunas/corpus/public. Framework-free engine with one HTMLAudioElement created outside React, getState/subscribe, global timeline over recordings with src swap at boundaries, chapter next/prev (restart if >3 s), skip rules (default noise/singing/other_speaker/pause ≥20 s) scheduled from currentTime and playbackRate with undo event, moment queue items {shiurId,start,end?} pausing at end, Media Session (metadata, position state, prev/next = chapters, seek ±15 s, seekto), speed 0.75–2, sleep timer, progress callback every 5 s/pause/pagehide. Audio URLs from recordings[].audioUrl (media host, A1); playable:false recordings are skipped with an "unavailable" state.
- **Acceptance:** Vitest with a fake media element: timeline math across 2 recordings, skip scheduling at 1×/1.5×/2×, recording swap, moment end pause, chapter prev rule; no React import in the engine.

#### W2.6 — emunas-api Worker: D1 schema, search API, feedback API

- **Owns:** `workers/api/**`
- **Depends on:** W1.1, W1.3
- **Brief (inputs, deliverables):** Inputs: tech-live §5.2–5.4, §7; integration-plan §3.1. D1 migrations for emunas-search (moments, moment_entities, fts_words unicode61 remove_diacritics 2, fts_tri trigram, meta) and emunas-feedback (feedback table, no IP, salted ua hash). GET /api/search (hybrid FTS + Vectorize, RRF, group by shiur, filters, cursor; snippets only from generated text in D1, highlight by offsets), /api/similar, /api/health, POST /api/feedback (Turnstile, length caps, RATE), GET /admin/feedback (behind Access; JSON/CSV). Query normalization via @emunas/search-core normalizeQuery (import is fine once W2.2 lands; until then a local shim with the same signature). Cache API keyed by query+filters+corpus_rev. wrangler.jsonc with bindings DB_SEARCH, DB_FEEDBACK, VEC, AI, RATE, TURNSTILE_SECRET; workers_dev false; env.staging.
- **Acceptance:** vitest-pool-workers: filter combinations, a planted heardAs-like string seeded into a non-returned column never appears in any response, response keys equal the allowed list, Turnstile failure → 403, rate limit → 429, admin route rejects without Access header; migrations apply cleanly to a fresh local D1.

#### W2.7 — Site Workers, wrangler configs, deploy and preview workflows

- **Owns:** `apps/quiet/worker/**`, `apps/quiet/wrangler.jsonc`, `apps/quiet/public/_headers`, `apps/live/worker/**`, `apps/live/wrangler.jsonc`, `apps/live/public/_headers`, `.github/workflows/deploy.yml`, `docs/sites/ops-runbook.md`, `.github/workflows/ci.yml (preview-upload job only)`
- **Depends on:** W1.1, W1.5, W1.6
- **Brief (inputs, deliverables):** Inputs: integration-plan §3, §4. Quiet Worker: assets dist/, auto-trailing-slash, 404-page, X-Robots-Tag noindex on workers.dev hosts; no audio route and no R2 binding (A1). Live Worker: assets build/client, single-page-application, run_worker_first [/, /api/*, /admin/*], service binding API → emunas-api, / redirect by cookie then Accept-Language. _headers per §3.3 incl. CSP (Quiet: default-src 'self', script-src 'self' 'wasm-unsafe-eval', media-src 'self' <media origin>; Live also connect-src <media origin> for the service worker). env.staging in each. deploy.yml exactly as §3.5/§4 (corpus build with EMUNAS_MEDIA_ORIGIN → guard pre → rebuild with suppress → app builds → guard post → budgets → D1/Vectorize sync → deploy api, quiet, live; concurrency cancel-in-progress; daily 05:17 UTC; job summary). ci.yml extension for PR previews via wrangler versions upload --preview-alias pr-<n> bound to staging resources. Runbook: provisioning commands for the emunas-site-build bucket, the media.<domain> custom domain + CORS on emunas (A1), D1/Vectorize/Turnstile/Access, secrets list, rollback.
- **Acceptance:** wrangler deploy --dry-run passes for all three Workers; actionlint clean; a test run on a fork/branch deploys hello apps to workers.dev; the deploy job fails when the guard post-pass is given a planted fixture; no workflow step references R2 S3 credentials or binds the emunas bucket.

### Wave 3

#### W3.1 — Quiet catalog pages: title page, contents, sections, series

- **Owns:** `apps/quiet/src/pages/index.astro`, `apps/quiet/src/pages/[ed]/index.astro`, `apps/quiet/src/pages/[ed]/contents/**`, `apps/quiet/src/pages/[ed]/section/**`, `apps/quiet/src/pages/[ed]/series/**`, `apps/quiet/src/components/catalog/**`
- **Depends on:** W2.1, W2.3, W1.4
- **Brief (inputs, deliverables):** Inputs: .corpus index/series/build.json, @emunas/calendar thisWeek at build time, concept-quiet §5.1–5.3. Edition chooser at /, title page with this week (parsha + nearest zman), contents in guide order (Yiddish then English, then uncatalogued sections), numbered section tables sub-grouped (chumash/parsha, zman order) with jump lists, uncatalogued marks, no-recording rows greyed, series pages (Tanya by perek, part X of N, yi/en sibling links), coverage line 'N of 997 with notes'.
- **Acceptance:** Guide order matches pocket-guide-2012.json sections; section counts match ingest stats; Tanya grouped by perek; catalog-only rows show no AI text; pages render without JS; axe clean in both editions.

#### W3.2 — Quiet shiur page and player script

- **Owns:** `apps/quiet/src/pages/[ed]/shiur/**`, `apps/quiet/src/components/shiur/**`, `apps/quiet/src/scripts/player.ts`
- **Depends on:** W2.1, W2.3
- **Brief (inputs, deliverables):** Inputs: .corpus/shiurim/<id>.json, concept-quiet §5.4, tech-quiet §4, §7. Full page (catalog header, listen, outline with #s{i} anchors, write-up with margin times and source letters, graded sources, apparatus omitted when empty, mentioned line, neighbours) and catalog-only page (header + audio + neighbours + one sentence). Reserved transcript slot renders nothing. Player ≤6 KB br: sticky dock, delegated seek on a[data-rec][data-t], #t= fragment seek on load, margin mark aria-current at 4 Hz, Media Session, multi-recording continuation, keyboard only when dock focused. 'Open in the listening app' link via @emunas/links.
- **Acceptance:** All 7 sample shiurim render in both editions; confidence <0.6 absent; source letters link both ways; time links work with JS off (#t= href); e2e seek/dock/mark/track switch; page ≤120 KB raw / ≤30 KB br; no transcript UI in output.

#### W3.3 — Quiet calendar and years

- **Owns:** `apps/quiet/src/pages/[ed]/calendar/**`, `apps/quiet/src/pages/[ed]/years/**`, `apps/quiet/src/components/calendar/**`
- **Depends on:** W2.1, W2.3
- **Brief (inputs, deliverables):** Inputs: .corpus occasions.json, years.json; concept-quiet §5.5–5.6. Parsha and zman indexes and pages (both languages merged, sorted by year, seudah sub-headings), year index with unknown page that explains the gap.
- **Acceptance:** Every parsha/zman key has a page; uncatalogued guesses excluded; unknown-year count equals shiurim without years; works without JS.

#### W3.4 — Quiet AI indexes: sources, stories, people, inyanim

- **Owns:** `apps/quiet/src/pages/[ed]/sources/**`, `apps/quiet/src/pages/[ed]/stories/**`, `apps/quiet/src/pages/[ed]/people/**`, `apps/quiet/src/pages/[ed]/inyanim/**`, `apps/quiet/src/components/indexes/**`
- **Depends on:** W2.1, W2.3
- **Brief (inputs, deliverables):** Inputs: .corpus works/people/concepts/stories/entities.json; concept-quiet §5.7–5.10. Traditional order, resolved/apparently/place-not-identified wording, entity pages only at ≥2 shiurim (concepts ≥3), every line links to shiur + time, coverage line, 'partial and unreviewed' notice.
- **Acceptance:** Entity page set equals the threshold rule; every link resolves (link crawler); Sefaria link-out only for resolved; file count within budget.

#### W3.5 — Quiet search (Pagefind custom records)

- **Owns:** `apps/quiet/scripts/build-search.ts`, `apps/quiet/src/pages/[ed]/search/**`, `apps/quiet/src/scripts/search.ts`
- **Depends on:** W2.2, W2.3
- **Brief (inputs, deliverables):** Inputs: .corpus/search/docs.ndjson, tech-quiet §5. Pagefind Node API createIndex → addCustomRecord per shiur (edition-less url, meta titleOriginal/citation/oneLinerEn/oneLinerYi/lang/status, filters lang/category/status), run corpus-guard Pagefind checker before writeFiles; results rendered from meta only, no excerpts; query passed through normalizeQuery; no-JS fallback lists the indexes.
- **Acceptance:** Records contain only search-core fields; 'לג בעומר' and 'lag baomer' return the same shiurim; glue JS ≤3 KB br; guard clean on records; page works without JS.

#### W3.6 — Live static data emit and budgets

- **Owns:** `apps/live/build/**`
- **Depends on:** W2.1, W2.2, W2.4
- **Brief (inputs, deliverables):** Inputs: .corpus/*, tech-live §3.3. Emit public/data/ conforming exactly to the W2.4 data contract (apps/live/app/data types): corpus.json, facets.json, today.json (occasion → shiurim, moment-of-the-day pools, newly summarized from manifest updatedAt carried in .corpus), shiur/<id>.json (without writeup), writeup/<id>.<lang>.json, series/<id>.json, works.json + work/<id>.json, entity/{p,c,o}/<id>.json (≥2 shiurim), stories.json, moments/<lang>-<n>.json shards, quick-index.<lang>.json (MiniSearch over search-core fields), build.json. budgets.ts: ≤18,000 files total incl. prerender, ≤25 MiB/file, size targets per tech-live.
- **Acceptance:** Every emitted file validates against its TS type; budgets pass on real data; adding one new done shiur fixture changes only the expected files; guard post-pass clean.

#### W3.7 — Live listening room

- **Owns:** `apps/live/app/routes/s.$shiurId.tsx`, `apps/live/app/features/listening-room/**`, `apps/live/app/player-ui/**`
- **Depends on:** W2.4, W2.5
- **Brief (inputs, deliverables):** Inputs: shiur and writeup JSON, concept-live §5.3, §6; tech-live W8. Dock UI bound to the engine; header with clickable catalog topics (catalogTopicIdx), chapters with kind behaviour, Read tab with active paragraph and seek, Sources (Sefaria link-out for resolved), Insights, Questions (hear question / hear answer), Stories, Related; catalog-only state with audio; ?t= and &m= deep links (fallback to t); AI label on every text surface; no Transcript tab in the bundle (TRANSCRIPT_VIEW constant false). 'Printable page' link to Quiet via @emunas/links. Develops against the W2.4 data contract and fixtures; the real files come from W3.6 in the same wave.
- **Acceptance:** Playwright: ?t=754 starts within 1 s of 754; audio continues across 5 route changes; chapter next/prev; catalog-only shiur plays; bundle grep finds no transcript component; axe clean en/yi.

#### W3.8 — Live Today and series pages

- **Owns:** `apps/live/app/routes/_ui.index.tsx`, `apps/live/app/routes/series*.tsx`, `apps/live/app/features/today/**`, `apps/live/app/features/series/**`
- **Depends on:** W2.4, W1.4
- **Brief (inputs, deliverables):** Inputs: today.json, series JSON, @emunas/calendar runtime thisWeek (table-driven, no hebcal in bundle). Today: this week's parsha and occasions, continue row (from personal store interface; stub until W3.9), deterministic moment of the day, newly summarized strip, corpus counter. Series pages: ordered, Tanya by perek, side-by-side yi/en, progress. Develops against the W2.4 data contract and fixtures; the real files come from W3.6 in the same wave.
- **Acceptance:** Correct parsha/occasion for 10 fixed dates; moment of the day stable per date; all 17 series ordered by seriesOrder; no @hebcal code in client bundle.

#### W3.9 — Live personal store, My Shelf, queue and playlists

- **Owns:** `apps/live/app/store/**`, `apps/live/app/routes/shelf*.tsx`, `apps/live/app/routes/pl.tsx`, `apps/live/app/features/shelf/**`
- **Depends on:** W2.4, W2.5
- **Brief (inputs, deliverables):** Inputs: tech-live §4.2. IndexedDB (idb) stores progress/queue/playlists/saved/notes/history/prefs with schema version, migrations and per-record updatedAt; My Shelf pages; queue of moments; shared playlist /pl#<base64url>; export/import JSON. All storage access wrapped so the app works when storage is unavailable.
- **Acceptance:** Migration test; shared playlist round-trips; moment queue plays across shiurim (e2e); app works in a private window with storage blocked.

#### W3.10 — Search index sync: D1 rows, embeddings, Vectorize, model eval

- **Owns:** `workers/api/sync/**`, `apps/live/tests/eval/**`
- **Depends on:** W2.2, W2.6
- **Brief (inputs, deliverables):** Inputs: .corpus/search/moments.ndjson, tech-live §5.3, W16–W17. Incremental D1 sync (select id,hash → diff → batched INSERT OR REPLACE/DELETE, FTS rows too, meta.corpus_rev last); embeddings through Workers AI REST with cache in R2 emunas-site-build (emb/<model>/<hash>.f16); Vectorize upsert/delete by diff; 60-query eval set (20 en, 20 yi, 20 cross-language/transliteration) with recall@10 and MRR comparing bge-m3 vs qwen3-embedding-0.6b; record decision O10.
- **Acceptance:** Second run with no data change writes 0 rows and 0 vectors; one changed shiur writes only its rows; eval report committed with chosen model; guard clean on NDJSON and vector metadata; runs against staging resources in CI.

#### W3.11 — Cloudflare provisioning and media domain (ops)

- **Owns:** `(no repo files; Cloudflare account resources)`
- **Depends on:** W1.5, W2.7
- **Brief (inputs, deliverables):** A person with Cloudflare credentials attaches the custom domain media.<domain> to the existing emunas bucket (A1) and sets its CORS rules (AllowedOrigins: https://library.<domain>, https://analyze.<domain>, plus staging/preview origins as needed; methods GET, HEAD; Range allowed as a request header), sets EMUNAS_MEDIA_ORIGIN for deploy builds, and creates emunas-site-build, D1 emunas-search/-staging and emunas-feedback/-staging, Vectorize emunas-moments/-staging (1024, cosine, metadata indexes audio_lang, kind, category, year), Turnstile widget, Access app. No emunas-audio bucket and no copy step.
- **Acceptance:** a manual iOS Safari and Android Chrome check plays and seeks an audioUrl from a staging page (Range → 206); a CORS fetch() from both site origins succeeds; a recording with a Hebrew/space/# key plays; the 3 .WMA recordings show as unavailable.

### Wave 4

#### W4.1 — Live Explore and lenses

- **Owns:** `apps/live/app/routes/explore.tsx`, `apps/live/app/features/explore/**`
- **Depends on:** W3.6, W2.4
- **Brief (inputs, deliverables):** Inputs: corpus.json, facets.json, moment shards, entity JSON; tech-live §4.3, W11–W12. Facet Web Worker with bitsets, list and moments units (virtualized), URL state, Luach/Years/Connections SVG lenses with text alternatives.
- **Acceptance:** Facet counts match a brute-force reference; filters <5 ms on 997 rows; URL state round-trips; undated lane equals shiurim without years; Connections hides edges <5 shared shiurim; keyboard navigable.

#### W4.2 — Live seforim, maasios and entity pages

- **Owns:** `apps/live/app/routes/seforim*.tsx`, `apps/live/app/routes/maasios.tsx`, `apps/live/app/routes/{p,c,o}.*.tsx`, `apps/live/app/features/{seforim,maasios,entities}/**`
- **Depends on:** W3.6, W2.4, W2.5
- **Brief (inputs, deliverables):** Inputs: works/work/stories/entity JSON; tech-live W14a/W14b. Shelf (genre-only works not shelved), work pages with pasuk/daf views from parsed sefariaRef, unlocated mentions; maasios library with stories-only play mode; person page split cited / in stories / discussed; concept and occasion pages.
- **Acceptance:** Genesis view lists pesukim in order with moments; stories-only queue plays back to back; every entity link resolves; axe clean.

#### W4.3 — Live command bar and search page

- **Owns:** `apps/live/app/features/command-bar/**`, `apps/live/app/routes/search.tsx`
- **Depends on:** W3.6, W2.6, W3.10
- **Brief (inputs, deliverables):** Inputs: quick-index, /api/search; tech-live §4.4. Lazy MiniSearch suggestions (entities, occasions, 'Tanya 12', year), full results via /api/search on Enter/250 ms idle, grouped by shiur showing matched field, offline/failed fallback labelled 'shiur-level results', RTL input.
- **Acceptance:** Suggestions with network off; full results from the staging API; fallback path tested; results never show text not present in generated/catalog fields (test against API response keys).

#### W4.4 — Live 'same idea elsewhere' neighbours

- **Owns:** `apps/live/build/neighbors.ts`
- **Depends on:** W3.10, W3.6
- **Brief (inputs, deliverables):** Inputs: embedding cache. Brute-force cosine over insights and sections, top 5 from other shiurim above threshold, written into shiur JSON related.neighbors; labelled as a suggestion in the UI (UI change limited to a component in features/listening-room via a small agreed prop; coordinate with W3.7 owner).
- **Acceptance:** Never same-shiur neighbours; < 3 min in CI; deterministic output for unchanged cache.

#### W4.5 — Live prerender and SEO

- **Owns:** `apps/live/react-router.config.ts`, `apps/live/app/seo/**`
- **Depends on:** W3.7, W3.8, W1.8, W2.1
- **Brief (inputs, deliverables):** Inputs: integration-plan §2.3, tech-live W15. prerender() lists Today per UI, shiur, series, occasion, work and entity (≥3 shiurim) routes; OG tags; canonical to the Quiet equivalent via links.canonicalFor; hreflang; noindex on Explore/search/shelf/pl; robots.txt; no sitemap. Route lists come from .corpus (entities.json, works.json, series.json), not from page components, so this runs in parallel with W4.2; the file-count acceptance is verified at wave merge once W4.2 lands.
- **Acceptance:** Every prerendered page has canonical pointing at <domain> (never analyze.*), OG title/description; noindex present on app-only routes; file count within budget.

#### W4.6 — Quiet SEO, sitemaps, cross-site links, About shell

- **Owns:** `apps/quiet/src/pages/sitemap*.ts`, `apps/quiet/src/pages/robots.txt.ts`, `apps/quiet/src/pages/[ed]/about/**`, `apps/quiet/src/components/seo/**`
- **Depends on:** W3.1, W3.2, W3.3, W3.4, W1.8
- **Brief (inputs, deliverables):** Inputs: integration-plan §2.3. Self-canonical, hreflang pairs + x-default, OG tags from catalog title + oneLiner, per-edition sitemaps from .corpus, robots.txt, About page with clearly marked placeholders for human-written text; cross-links to Live verified with @emunas/links.
- **Acceptance:** Sitemap lists every shiur in both editions; link checker passes including cross-site links (validated against Live route table); About contains no generated text.

#### W4.7 — Live feedback UI

- **Owns:** `apps/live/app/features/feedback/**`
- **Depends on:** W2.6, W3.7
- **Brief (inputs, deliverables):** Inputs: tech-live §7. Two-tap 'Something's wrong here' on every item (wrong source, wrong name, wrong time, misrepresents, other) with optional text, Turnstile, target {shiurId, momentId, field}, rev.
- **Acceptance:** E2E against staging api stores a report; Turnstile failure handled; reachable by keyboard; works in both UI languages.

#### W4.8 — Live PWA, service worker, offline downloads (removed)

> **Removed (owner decision, 2026-11-19):** in-browser offline downloads do not belong in a website. Live has no service worker, no offline shell and no Cache Storage; Download is a plain link to the media URL of the version being played. `manifest.webmanifest` stays. The original brief is kept below for history.

- **Owns:** `apps/live/public/manifest.webmanifest`
- **Depends on:** W3.9, W2.5
- **Brief (inputs, deliverables, superseded):** Inputs: tech-live §4.5. Precache shell, /data/* SWR with cap, audio (media.<domain> URLs, A1) network-only unless downloaded; downloads fetch() the audioUrl with CORS (mode: cors; the bucket's CORS allows the Live origin) into Cache Storage audio-v1 keyed by that URL, with navigator.storage.persist(); SW serves Range 206 from cached blobs; shiur + writeup JSON pinned with audio; playable:false recordings cannot be downloaded.
- **Acceptance:** Airplane-mode playback with seeking of a downloaded shiur on iOS Safari and Android Chrome (manual); shell loads offline (Playwright offline mode).

### Wave 5

#### W5.1 — End-to-end, accessibility, performance and search-quality gates

- **Owns:** `apps/quiet/test/e2e/**`, `apps/live/tests/e2e/**`, `tests/cross-site/**`, `.github/workflows/ci.yml (test jobs section)`
- **Depends on:** W4.1, W4.2, W4.3, W4.5, W4.6, W4.7, W4.8
- **Brief (inputs, deliverables):** Playwright matrix (Chromium, WebKit, mobile) for both sites incl. JS-disabled project for Quiet; axe on every route type in en/yi; Lighthouse CI budgets (Quiet perf ≥95 mobile, LCP <1.8 s; Live LCP ≤2.0 s, INP ≤200 ms); cross-site tests: equivalent links land on matching content for shiur/section/time/series/occasion/work/person/concept; search eval regression gate (fail >5 points drop); internal link crawler; html-validate sample.
- **Acceptance:** All gates run on every PR and pass on main; a deliberately broken cross-link or planted leak fails CI.

#### W5.2 — Transcript view scaffolding (OFF) in both sites

- **Owns:** `packages/corpus/src/transcript-gate.ts`, `packages/corpus-guard/src/eligible.ts`, `apps/quiet/src/components/shiur/FollowText.astro`, `apps/live/app/features/transcript/**`, `apps/live/app/config/feature-flags.ts`
- **Depends on:** W3.2, W3.7, W1.6
- **Brief (inputs, deliverables):** Inputs: integration-plan §0.3, C17, §4 last bullet. corpus:build emits .corpus/transcript/<recordingId>.json only for gate-approved recordings; Quiet FollowText slot and Live Transcript tab compiled only when the flag is on (Live TRANSCRIPT_VIEW constant false so the bundler drops it); guard accepts transcript files only for eligible ids and keeps scanning everything else; allowSearch remains unused (no search ingestion path).
- **Acceptance:** With flag off: no transcript component in either bundle, no transcript/ directory in any output, guard passes. Test build with flag on and one synthetic fixture recording with matching identity emits exactly one transcript file in each site and the guard accepts only that one; identity mismatch emits none.

#### W5.3 — Fixed copy: About texts, AI label wording, Yiddish UI review

- **Owns:** `apps/quiet/src/content/**`, `apps/live/app/content/**`, `packages/i18n/src/vocab/**`
- **Depends on:** W4.6, W4.5
- **Brief (inputs, deliverables):** Human-supplied About texts (the Mashgiach and the collection, how the notes were made, how to report an error, what is excluded) in en and yi; final wording of the standing AI label; review of Yiddish UI strings by a Yiddish reader. Placeholders stay clearly marked until text arrives.
- **Acceptance:** No generated text in About; Yiddish copy signed off by a named reviewer; label identical in both sites.

### Wave 6

#### W6.1 — Launch review and owner decisions

- **Owns:** `docs/sites/launch-checklist.md`
- **Depends on:** W5.1, W5.2, W5.3, W3.11
- **Brief (inputs, deliverables):** Walk the checklist: owner decisions O1–O10 recorded, first verbatim report reviewed by a person, guard report clean, media.<domain> + CORS verified (A1), domains attached, Access/Turnstile live, rollback rehearsed.
- **Acceptance:** Checklist signed; production deploy from main serves both hosts with current data; a fresh pipeline data commit reaches production with no code change.

