# Corpus aggregates (W2.1)

`npm run corpus:build` now projects with `@emunas/normalize` as the `Keyer` (`src/keyer-normalize.ts`) and writes these files next to the W1.2 outputs in `.corpus/`. Their shapes are in `types.ts`, and apps import the types from `@emunas/corpus/aggregate`. The Node wrapper is `buildCorpusWithAggregates` in `@emunas/corpus/build/aggregate`.

| File | Contents |
|---|---|
| `sections.json` | Each catalog section (index.json order) with its shiur ids in catalog order. Every in-scope shiur is in exactly one section. |
| `neighbours.json` | `shiurId → { section, series, sameOccasion }`. `section` and `series` give the position, count and prev/next. `sameOccasion` holds the other shiurim with the same parsha/zman key, in both languages and sorted by year. |
| `series.json` | Ordered parts. A series whose parts carry a `perek` (Tanya) also gets `groups`, which are consecutive runs of the same perek in series order. `sibling` links `x-yi` to `x-en`. |
| `occasions.json` | Every parsha (Torah order) and occasion (from Elul) in the normalize tables, with Yiddish and English shiurim together, sorted by year. Seudah and lechaim entries sit under `subs`. One-off and unmapped values go to `other`. Uncatalogued rows with a parsha/zman guessed from a file name are left out and counted in `excluded`. |
| `years.json` | Shiur ids per year, in approximate calendar order (`calendar-order.ts`). `unknown` holds the shiurim without `hebrewYears`. |
| `works.json` | Works in table order (group, then order), with unmapped works after them by key. Each work has `refs`, which are the resolved and inferred mentions with a parseable Sefaria ref in the work's own order, each with its mentions (shiur, moment id, t). Everything else is in `unlocated`. A generic label ("Gemara", "Midrash") that has a parseable ref is filed under the ref's work. |
| `people.json` | Each person key with its spellings and its shiurim (`mentioned`, and the story moment ids). |
| `concepts.json` | Concepts that are not on the stop-list and appear in at least `CONCEPT_MIN_SHIURIM` shiurim. Each entry lists its shiurim and the chapter ids whose Yiddish title contains the term. |
| `stories.json` | Every story (title, people, shiur, t, years) with no retelling, plus `byPerson`, which groups them by the story's first person. |
| `entities.json` | Shiur counts per work, person, concept and occasion, plus `quietPage` (works and people ≥2, concepts ≥3, never genre works) and `livePrerender` (≥3). |

Unmapped parsha, zman, work and person strings reach `build-report.json` (`unmapped`) through the projector. The aggregator adds summary lines (counts only) to `warnings`. Nothing here fails the build because of data.

Tests are in `test/aggregate/`. They cover the mini corpus, with golden files in `test/aggregate/golden/`, and the acceptance checks on real data. After an intended output change, regenerate the goldens with `npx vitest run test/aggregate -u` and review the diff.
