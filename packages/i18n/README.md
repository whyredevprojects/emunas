# @emunas/i18n

Shared, framework-free i18n for both sites (integration-plan §1.3, §8 W1.7). Browser-safe, no
dependencies. UI strings are **not** here: each app keeps `…/i18n/{en,yi}.ts` and builds its `t()`
with `createT`.

| Export | What it does |
|---|---|
| `createT<K>({ en, yi }, lang)` | Typed `t(key, params)`. `K` is the app's key union; a missing key in a table or an unknown key at a call site fails `tsc` (proved by `test/t-tsc.test.ts`, which runs the real compiler on fixtures). `{name}` placeholders; `params.count` picks the plural form through `Intl.PluralRules` (`en` and `yi`: `one`/`other`). |
| `formatHebrewYear(5743, lang)` | `תשמ"ג (1982–83)`. Options: `civil: false`, `marks: "hebrew"` (״/׳ instead of ASCII `"`/`'`), `thousands: true` (`ה'תשמ"ג`). Same text in both editions (Hebrew year first, civil pair in parentheses). Bad input returns the digits instead of throwing. `formatHebrewYears` for several years. |
| `hebrewNumeral`, `hebrewLetters`, `numeralValue` | Local gematria (1–999, ט"ו/ט"ז), so there is no dependency on `@emunas/normalize`; normalize may re-export. |
| `formatDuration(sec, lang, "short" \| "long" \| "clock")` | `1 hr 19 min` / `1 שעה 19 מינ׳`; `1 hour 19 minutes` / `1 שעה 19 מינוטן`; `1:19:05`. Ordinary digits in both languages. |
| `formatNumber` | Western digits and grouping in both editions. |
| `scriptOf(text)` | `he` \| `latin` \| `mixed` (marks, digits, punctuation ignored; no letters counts as `latin`). `"The קדושה of צדיקים"` → `mixed`. |
| `firstStrongDir(text)` | The `dir="auto"` rule (first strong character), so build-time `dir` matches the browser. |
| `langFor(text, shiurLang)` | `{ lang, dir, script }` for a catalog/data string: Latin → `en`; Hebrew script → `yi` in a Yiddish shiur, `he` in an English one; mixed → by first strong character. Render the result isolated (`<bdi>` or its own element). |
| `isolate(text, dir?)`, `stripBidiControls` | FSI/LRI/RLI…PDI for plain-text contexts (`<title>`, `aria-label`, Media Session). |
| Vocabulary | `categoryLabel`, `sectionKindLabel`, `languageName`, `audioLanguageLabel`, `notice("aiNotes" \| "aiNotesShort" \| "notesPending" \| "uncatalogued" \| "listedInGuide")`, `coverageNotice(518, 997, lang)`, `formatSourceRef` / `sourceRefParts` (resolved: plain; inferred: "apparently …" / "לכאורה …"; unresolved with a work: "Zohar (place not identified)"; nothing displayable → `null`). Unknown values show as themselves. |
| Corpus vocabulary (`vocab/corpus.ts`) | `corpusLabel(key, lang, params)` over `CORPUS_LABELS` (en/yi, one key union): the corpus AI labels (Quiet C6 index/entry/story, Live E.3 and their reviewed variants via `corpusEntryLabel(site, reviewed, lang)`), index and kind names, `personGroupLabel` in sefer order (`PERSON_GROUP_ORDER`), `topicGradeLabel`, "told in N other shiurim", "also taught in", "throughout", "notes not prepared yet", report wording. Status `CORPUS_LABEL_STATUS = "proposed"`. |

The `Category`, `SectionKind` and `Resolution` unions mirror `src/types.ts`; `test/vocabulary.test.ts`
imports the pipeline types (read-only) and fails if they drift.

## Status of the wording

All Yiddish and English labels are `VOCABULARY_REVIEW_STATUS = "unreviewed"`. They follow the
concept docs (plain, no marketing voice, "דער משגיח" / "the Rav") but need a native reader's pass,
especially the Yiddish category names (`set`, `misc`, `current`), the section kinds and the
"place not identified" wording.
