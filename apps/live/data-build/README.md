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
| `shiur/<id>.json` | the projected shiur without the write-up; `related` from `neighbours.json` (prev/next in series order, else catalog section order); `neighbors` empty until W4.4 |
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

## Budgets (`budgets.ts`)

- at most 18,000 files: `build/client` after the app build; before it, data files + other public
  files + projected prerender (2 × (shiur + work + entity files + 100));
- at most 25 MiB per file; at most 1,000 work files;
- brotli (quality 5) targets: corpus 150 KiB, facets 60 KiB, today 30 KiB, shiur 40 KiB, write-up
  8 KiB, stories 120 KiB, quick index 600 KiB.

`corpus.json` is a soft target: with the W2.4 contract every row carries both one-liners, so the
file is about 205 KiB br at 518 summarized shiurim and will be about 330 KiB at 997. It is reported
as a warning and fails above 400 KiB. Meeting 150 KiB needs a contract change (for example one-liners
in a separate per-language file).

On today's data (518 of 997 summarized): 4,243 data files, about 10,700 files projected with the
prerender, largest shiur 18.6 KiB br, largest write-up 6.3 KiB br, facets 52 KiB, today 16 KiB,
stories 54 KiB, quick index 255 KiB per language.

## Tests

`npm test -w @emunas/live` runs them after the app tests (`vitest.config.ts` here):

- `emit.test.ts`: the mini corpus: schema validation, completeness, facets/entities/today/series/
  works/moments consistency, the quick index through MiniSearch and `normalizeQuery`, no forbidden
  keys or substrings (and the corpus-guard scanner), determinism, the validator rejecting unknown
  keys and wrong types, the W2.4 fixtures validating.
- `incremental.test.ts`: a shiur flips from pending to done; only the expected files change and all
  others keep their bytes and mtimes.
- `real-data.test.ts`: the deploy order on the repo's data, with the guard pre-pass and the verbatim
  post-pass over the emitted tree (about 45 s); budgets pass.
- `budgets.test.ts`: each budget check fires; the CLI end to end.
