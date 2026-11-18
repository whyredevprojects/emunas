# @emunas/i18n

Shared, framework-free i18n for both sites (integration-plan §1.3, §8 W1.7). Browser-safe, no
dependencies. UI strings are **not** here: each app keeps one `…/i18n/<lang>.ts` per interface
language and builds its `t()` with `createT`.

## Languages

`UI_LANGS` in `src/lang.ts` is the one place the language set lives: `["en", "yi", "he"]`, and
`UiLang` is derived from it. Every per-language table in this package (and in the apps) is a
`Record<UiLang, …>` or `MessageTables<K>`, so adding a language to the list makes `tsc` report each
table that still lacks it. Code never lists the languages itself: it loops over `UI_LANGS`, builds
records with `byUiLang(fn)`, and finds alternates with `otherUiLangs(lang)`.

To add a language: add it to `UI_LANGS`, `UI_DIR`, `UI_LOCALE`, `UI_ENDONYM` and `CONTENT_FALLBACK`,
then fill every table `tsc` reports (here and in the apps). Its content comes from translation
overlays (`TRANSLATION_LANGS` in `src/types.ts`, docs/translation-runbook.md).

| Export | What it does |
|---|---|
| `UI_LANGS`, `UiLang`, `isUiLang` | The interface languages (`en`, `yi`, `he`); order is the order of menus and hreflang. |
| `UI_DIR`, `UI_LOCALE`, `UI_ENDONYM` | Per language: `ltr`/`rtl`; BCP 47 tag for `lang`/hreflang/`Intl`; its own name ("English", "אידיש", "עברית"). |
| `otherUiLangs(lang)`, `byUiLang(fn)` | The other languages in order; a complete `Record<UiLang, T>` from a function. |

## Content languages (`src/content.ts`)

Generated text is written by the pipeline in `en` and `yi` (`SOURCE_LANGS`); every further language
(`TranslatedLang`, today `he`) comes from translation overlays, applied by the data layer only when the
overlay's `sourceHash` matches the current en/yi text.

| Export | What it does |
|---|---|
| `Localized<T>`, `LocalizedText` | One value per language: `en` and `yi` required, every other `UiLang` optional. A new `UiLang` becomes optional automatically. |
| `CONTENT_FALLBACK` | Per reader language, the languages to show in order, starting with the reader's own: `he → yi → en`, `yi → en`, `en → yi`. Every chain ends in a source language. |
| `pickText(text, reader)` | `{ text, lang, dir, fallback }`: the first non-blank text along the chain. Put `lang`/`dir` on the element that shows it (the language actually shown, not the edition's). |
| `pickLocalized(values, reader, isPresent?)` | The same for any `Partial<Record<UiLang, T>>` (write-up blocks, lists): `{ value, lang, dir, fallback }` or `null`. Default presence test `hasContent` (null, blank strings and empty arrays are missing). |

## Formatting, scripts and vocabulary

| Export | What it does |
|---|---|
| `createT<K>({ en, yi, he }, lang)` | Typed `t(key, params)`. `K` is the app's key union; a missing key in a table, a missing language table, or an unknown key at a call site fails `tsc` (proved by `test/t-tsc.test.ts`, which runs the real compiler on fixtures). `{name}` placeholders; `params.count` picks the plural form through `Intl.PluralRules`. |
| `PluralMessage`, `selectPlural`, `pluralCategory` | Only `other` is required. `en`/`yi` use `one`/`other`; `he` uses `one`/`two`/`other`, and a message without `two` uses `other` for 2 ("2 שיעורים"), so a dual is added only where Hebrew wants one ("שעתיים", "שני שיעורים"). |
| `formatHebrewYear(5743, lang)` | `תשמ"ג (1982–83)`. Options: `civil: false`, `marks: "hebrew"` (״/׳ instead of ASCII `"`/`'`), `thousands: true` (`ה'תשמ"ג`). Same text in every edition (Hebrew year first, civil pair in parentheses). Bad input returns the digits instead of throwing. `formatHebrewYears` for several years. |
| `hebrewNumeral`, `hebrewLetters`, `numeralValue` | Local gematria (1–999, ט"ו/ט"ז), so there is no dependency on `@emunas/normalize`; normalize may re-export. |
| `formatDuration(sec, lang, "short" \| "long" \| "clock")` | `1 hr 19 min` / `1 שעה 19 מינ׳` / `1 שע׳ 19 דק׳`; `1 hour 19 minutes` / `1 שעה 19 מינוטן` / `1 שעה 19 דקות` (2 hours: `שעתיים`); `1:19:05`. Ordinary digits in every language. |
| `formatNumber` | Western digits and grouping (1,997) in every edition. |
| `scriptOf(text)` | `he` \| `latin` \| `mixed` (marks, digits, punctuation ignored; no letters counts as `latin`). `"The קדושה of צדיקים"` → `mixed`. |
| `firstStrongDir(text)` | The `dir="auto"` rule (first strong character), so build-time `dir` matches the browser. |
| `langFor(text, shiurLang, edition)` | `{ lang, dir, script }` for a catalog/data string. `shiurLang` is the shiur's `AudioLang` (`"yi"`/`"en"`) or `null` for a string of no one shiur (corpus names, index entries). Latin → `en`; Hebrew script → `hebrewScriptLang(shiurLang, edition)`; mixed → by first strong character. Render the result isolated (`<bdi>` or its own element). |
| `hebrewScriptLang(shiurLang, edition)` | The rule for Hebrew-script data strings: `he` in the Hebrew edition; otherwise `yi` in a Yiddish shiur (or, with `shiurLang` null, in the Yiddish edition); otherwise `he` (loshn koydesh terms in English). In the Hebrew edition Hebrew-script data (mostly names, seforim and catalog phrases) is read by Hebrew rules, consistent with the page around it. |
| `isolate(text, dir?)`, `stripBidiControls` | FSI/LRI/RLI…PDI for plain-text contexts (`<title>`, `aria-label`, Media Session). |
| Vocabulary | `categoryLabel`, `sectionKindLabel`, `languageName(l, lang)` (any `UiLang`), `audioLanguageLabel`, `notice("aiNotes" \| "aiNotesShort" \| "notesPending" \| "uncatalogued" \| "listedInGuide")`, `coverageNotice(518, 997, lang)`, `formatSourceRef` / `sourceRefParts` (resolved: plain; inferred: "apparently …" / "לכאורה …"; unresolved with a work: "Zohar (place not identified)" / "Zohar (המקום לא זוהה)"; nothing displayable → `null`). Unknown values show as themselves. |
| Corpus vocabulary (`vocab/corpus.ts`) | `corpusLabel(key, lang, params)` over `CORPUS_LABELS` (one table per `UiLang`, one key union; `CORPUS_LABELS[lang]` is the table): the corpus AI labels (Quiet C6 index/entry/story, Live E.3 and their reviewed variants via `corpusEntryLabel(site, reviewed, lang)`), index and kind names, `personGroupLabel` in sefer order (`PERSON_GROUP_ORDER`), `topicGradeLabel`, "told in N other shiurim", "also taught in", "throughout", "notes not prepared yet", report wording. Status `CORPUS_LABEL_STATUS = "proposed"`. |

The `Category`, `SectionKind`, `Resolution` and `AudioLang` unions mirror `src/types.ts`, and
`TranslatedLang` mirrors `TranslationLang`; `test/vocabulary.test.ts` and `test/content.test.ts`
import the pipeline types (read-only) and fail if they drift.

## Status of the wording

All labels are `VOCABULARY_REVIEW_STATUS = "unreviewed"` (corpus labels and the AI label:
`"proposed"`). They follow the concept docs (plain, no marketing voice; "דער משגיח" / "המשגיח" /
"the Mashgiach"; never "הרב" as a stand-in for him, never שליט"א) but need a native reader's pass:
the Yiddish category names (`set`, `misc`, `current`), the section kinds and the "place not
identified" wording; the Hebrew wording has not been read by a Hebrew reader at all. Hebrew is
written without nikud; where a Yiddish UI word has no natural Hebrew equivalent, the Hebrew word
itself is used.
