# @emunas/api — the `emunas-api` Worker

Search and feedback for the Live site (integration-plan §3.1, tech-live §5.2–5.4, §7). Reached only
through the Live site Worker's service binding `API`: `workers_dev: false`, no preview URLs, no routes.

| Route | What |
|---|---|
| `GET /api/search` | Hybrid moment search: D1 FTS5 (`fts_words` unicode61 + `fts_tri` trigram) and Vectorize (query embedded with Workers AI), fused with reciprocal-rank fusion (k = 60), catalogued boost and confidence factor, grouped by shiur, cursor-paged. Cached in `caches.default` for 10 min, keyed by the canonical query + filters + `meta.corpus_rev`. |
| `GET /api/similar?moment=&limit=` | Vectorize neighbours of one moment, other shiurim only. |
| `GET /api/health` | `{ rev, d1, vectorize }`; 503 if D1 is down. |
| `POST /api/feedback` | Report → D1 `emunas-feedback`. Turnstile (403 on failure), length caps, 8 KiB body cap, rate limit. |
| `GET /admin/feedback?status=&format=json\|csv&limit=` | Export, Cloudflare Access JWT verified here (401 without, 403 invalid). |

`/api/search`, `/api/similar` and `/api/feedback` share the `RATE` binding (30 requests / 10 s per
client address; the address is the rate-limit key only and is never stored).

## Search parameters

`q` (required, ≤200 chars) · `ui=en|yi|he` (any `UI_LANGS` language from `@emunas/i18n`; snippet
language preference) · `mode=hybrid|lexical|semantic` · `audio=en,yi` (recording language,
`AUDIO_LANGS`; never `he`) · `kind=section,insight,…` · `category=` · `occasion=` · `series=` · `work=` ·
`person=` · `concept=` · `topic=` · `yearFrom=` · `yearTo=` · `limit` (1–50, default 20) · `cursor`.
Lists are comma-separated (≤10 values) of slugs. Unknown parameters → 400.

Entity filters (`work`, `person`, `concept`, `topic`; `ENTITY_TYPES` in `src/contract.ts`) take
**corpus ids** (`data/derived/corpus`, through the corpus layer and search-core's `MomentRow`), the
same ids the sites' entity pages use. Each type is its own namespace: `topic=hester-panim` and
`concept=hester-panim` are different filters. Several values of one type match any of them; several
types must all match. `topic` matches section moments by their chapter's topics and every other
moment by its shiur's topics at salience ≥ 0.6 (search-core C1.5). Entity filters are D1-only, so
semantic hits that fail one are dropped at hydration.

Response (exact keys, see `src/contract.ts` `ALLOWED_KEYS`):

```ts
{ rev, tookMs, next: string | null,
  groups: [{ shiurId, count }],
  results: [{ momentId, shiurId, kind, t, end, title: { en, yi, he }, matched: "title" | "text" | "semantic",
              snippet: { text, lang, marks: [start, end][] } | null, score }] }
```

`title` has one key per `UI_LANGS` language (null where a moment has no title in it). Languages
are never listed in the Worker: titles, the `ui` parameter, moment ids (`….<lang>`), vector ids
and feedback `ui` all follow `UI_LANGS`, so a language added there reaches the API unchanged.

Snippets are plain text cut from `moment_text` (generated display text) with highlight offsets; the
client renders `<mark>`. The snippet language is the first text, in the order reader's language →
the language the words matched in → the reader's `CONTENT_FALLBACK` chain (he → yi → en), that holds
the query words (else the first text in that order); `snippet.lang` names it, so the client sets
`lang`/`dir` from it. No HTML is ever returned. A cursor from another `corpus_rev` gets 409
`stale_cursor` (restart the search).

## What the index sync (W3.10, `sync/`, see `sync/README.md`) writes

Schema: `migrations/search/0001_init.sql`, rebuilt by `0002_languages.sql` (schema version 2: no
language list anywhere in the schema; the next sync rewrites the whole index).

- `moments`: one row per moment, facets copied from the shiur, `titles` (a JSON object of language →
  generated display title, read key by key with `parseTitles`), `hash` for diffing.
- `moment_entities`: `(moment_id, type ∈ work|person|concept|topic, entity_id)`, corpus ids. `type` is
  plain TEXT (no CHECK), so `topic` needed no migration.
- `moment_text(id, lang, title, body)`: the generated title/body **as displayed** (after `normalizeHe`).
  Snippets come only from here.
- `fts_words` / `fts_tri(id, lang, title, body)`: the same text in **search form**, i.e. `fold()` tokens
  joined by spaces (the same folding `normalizeQuery` applies to the query), so `ל"ג`, `ל”ג` and `lag`
  variants meet.
- Vectorize `emunas-moments`: one vector per (moment, language), id `vectorIdFor(momentId, lang)` =
  `<momentId>@<lang>` (≤64 bytes), metadata `{ shiurId, t, hash, audio_lang, kind, category, year }`
  with metadata indexes on `audio_lang`, `kind`, `category`, `year`. Metadata is never passed to clients.
- `meta.corpus_rev` written last.

Only generated and catalog text may be written to any of these (integration-plan §0.1–0.2).

## Notes for the site Worker (W2.7) and Live UI (W4.3, W4.7)

- The Live Worker must forward `/api/*` and `/admin/*` requests unchanged (including
  `Cf-Access-Jwt-Assertion` and `CF-Connecting-IP`) through the `API` binding.
- Feedback body: `{ target: { shiurId, momentId?, field? }, reason, text?, ui, rev, turnstile }` → `202 { id }`.
- Errors are `{ error, param? }`; `param` names the offending known parameter, or `unknown_parameter`.

## Query normalization

`src/query.ts` adapts `normalizeQuery` from `@emunas/search-core` (W3.10): its `terms` are the
tokens that must all match, every further search-core `variant` (alias expansion) and the
pre-variant spelling are alternative token sequences. The index side uses search-core's
`momentSearchText` (same `fold`); see `sync/README.md`.

## Commands

```sh
npm test -w @emunas/api              # vitest in workerd (@cloudflare/vitest-plugin), fresh local D1 per run
npm run typecheck -w @emunas/api
npm run check:deploy -w @emunas/api  # wrangler deploy --dry-run, production and staging
npm run migrations:local -w @emunas/api   # apply both migration sets to a fresh local D1 via wrangler
npm run test:sync -w @emunas/api          # index sync tests (Node, local D1 via Miniflare)
npm run search:sync:local -w @emunas/api  # sync .corpus/search into the local D1 `wrangler dev` reads
npm run search:sync -w @emunas/api -- --env staging|production   # CI: D1 + Workers AI + Vectorize
```

Secrets per environment: `TURNSTILE_SECRET`, `FEEDBACK_HASH_SALT`. Vars: `ACCESS_TEAM_DOMAIN`,
`ACCESS_AUD`, `EMBED_MODEL`. The `database_id` values in `wrangler.jsonc` are placeholders until the
D1 databases are created.
