# @emunas/normalize

Text folding, alias tables, stable keys, the Sefaria ref parser and Hebrew-year gematria, shared
by both sites (integration-plan §1.2, §1.3, §8 W1.3). Pure TypeScript, no dependencies, no I/O,
browser-safe: the same code runs in the corpus build, the Pagefind glue, MiniSearch and the API
Worker.

All tables are marked `reviewStatus: "unreviewed"`. They are the first thing a human reviewer is
expected to correct.

## API

| Function | What it does |
|---|---|
| `normalizeHe(s)` | Mechanical cleanup for ids and FTS rows: NFC, maqaf → `-`, strip nikud/cantillation (U+0591–U+05C7), decompose presentation forms, unify `״ ” “` → `"` and `׳ ’ ‘` → `'`, collapse whitespace. Display text is never passed through it. |
| `foldBasic(s)` | Matching form used by every key: `normalizeHe` + Latin diacritics removed, lower case, quotes/geresh removed (`ל"ג` → `לג`), punctuation and hyphens → space, Yiddish ligatures expanded. **Frozen**: keys derive from it. |
| `fold(s)` / `foldTokens(s)` | Search folding: `foldBasic` + the transliteration variant table (`tables/variants.ts`). `ל"ג בעומר`, `ל”ג בעומר` and `lag baomer` all fold to `לג בעומר`; `Hanukkah` → `חנוכה`; `Shabbat` → `shabbos`. Use on both the indexed text and the query. |
| `slugify(s)`, `isKey(k)` | Deterministic ASCII keys (`[a-z0-9-]`). Hebrew input gets a consonantal transliteration plus a 6-hex hash (`עקבתא דמשיחא` → `ekbsa-dmshycha-xxxxxx`). |
| `toHebrewNumeral`, `hebrewYear`, `parseHebrewNumeral`, `parseHebrewYear` | Gematria. `hebrewYear(5743)` → `תשמ"ג`; `{ thousands: true }` → `ה'תשמ"ג`; `{ marks: "hebrew" }` uses ״/׳. Round-trips 5724–5800 (tested). |
| `lookupParsha(raw)`, `lookupZman(raw)` | Catalog `Shiur.parsha` / `Shiur.zman` → `{ key, status, sub, audience, parsha, occasion }`. `status` is `mapped`, `other` (a deliberate one-off) or `unmapped`. `סעודת X` → X with `sub: "seudah"`; `For Children` / `קינדער` → `audience`. |
| `lookupWork(raw)` | `SourceMention.work` → `{ key, status, work }` (group, order, he/yi/en, Sefaria titles, ordering scheme, `genre`). |
| `lookupPerson(raw)` | Person name → `{ key, status, person }`. |
| `lookupConcept(raw)` | `concepts[].he` → `{ key, he, merged, stop }`. |
| `parseSefariaRef(ref)` | `{ ok: true, corpus, book, section, commentator, workKey, baseWorkKey, he, en, start, end, sortKey }` or `{ ok: false, reason }`. Never throws. `compareRefs`, `compareSortKeys`, `refLabel`, `sefariaUrl` alongside. |
| `parshaKey`, `zmanKey`, `workKey`, `personKey`, `conceptKey` | The key alone. |
| `createKeyer()` | A Keyer for `@emunas/corpus` (W2.1 wires it) that also records unmapped values with counts, for `build-report.json`. |

## Keys (stable; URLs are built from them)

- **Occasions.** Parsha keys and zman keys share one namespace and are disjoint (tested). Parsha
  keys are Ashkenazi transliterations: `bereishis`, `lech-lecha`, `ki-sisa`, `behaaloscha`; combined
  parshiyos join their parts: `vayakhel-pekudei`, `behar-bechukosai`. Each row carries the
  `@hebcal/core` name (`hebcal`) for `@emunas/calendar`. Zman keys, in order from Elul: `elul`,
  `rosh-hashanah`, `aseres-yemei-teshuvah`, `shabbos-shuvah`, `yom-kippur`, `sukkos`,
  `hoshana-rabbah`, `shemini-atzeres`, `kislev`, `yud-tes-kislev`, `chanukah`, `shabbos-chanukah`,
  `zos-chanukah`, `teves`, `shovavim`, `tu-bishvat`, `shabbos-shirah`, `parshas-shekalim`, `adar`,
  `purim-katan`, `parshas-zachor`, `purim`, `shushan-purim`, `purim-meshulash`, `parshas-parah`,
  `parshas-hachodesh`, `nisan`, `rosh-chodesh-nisan`, `erev-pesach`, `pesach`,
  `chol-hamoed-pesach`, `shevii-shel-pesach`, `sefirah`, `iyar`, `lag-baomer`, `sivan`,
  `rosh-chodesh-sivan`, `shavuos`, `tamuz`, `yahrzeit-ohr-hachaim`, `bein-hametzarim`,
  `nine-days`, `shabbos-chazon`, `tishah-beav`, `shabbos-nachamu`, `tu-beav`. Each has a
  Hebrew-calendar `window` (dates, whole month, special Shabbos by hebcal event name, or a run of
  parshiyos). `other` is the bucket for one-offs and anything unmapped (C10).
- **Works.** Tanach books by Ashkenazi name (`bereishis`, `shmuel` for I+II), tractates as
  `bavli-<id>`, `mishnah-<id>`, `yerushalmi-<id>` (`pirkei-avos` for Avos), curated works by a
  slug of the English name (`bnei-yissaschar`). Unmapped: slug of the matching form.
- **People.** Curated key, else a slug of the loose person form (`the Kotzker Rebbe` →
  `kotzker-rebbe`).
- **Concepts.** `slugify` of the canonical Hebrew term (transliteration + hash).

## Never fail the build (C10)

Every lookup is total. Unmapped zman/parsha → `other`; unmapped work/person → its own slug; all
reported through `createKeyer().unmapped()`. Coverage is enforced here instead, by
`test/coverage.test.ts` over the snapshot in `seed/`:

- every parsha and zman string in today's ingest maps (or is an explicit `other`);
- every work cited in ≥ 2 shiurim (398 today) has a table row with group and order;
- every one of today's 3,553 distinct `sefariaRef` strings (8,011 mentions) parses;
- every person and work string gets a well-formed key.

## Refreshing the seed snapshot

```
npm run seed -w @emunas/normalize          # rewrites seed/*.json from data/derived
npm run test -w @emunas/normalize          # see what no longer maps
npm run inspect -w @emunas/normalize -- works 2   # or zman | parsha | people | concepts | refs | conflicts
```

`scripts/seed.ts` is dev-only. It reads `data/derived/ingest.json` (parsha, zman) and each
`extraction.json` (`sources[].work`, `sources[].sefariaRef`, `people[].name`,
`stories[].people[]`, `concepts[].he`) and writes only those values with counts. It never reads
transcripts and never writes transcript-derived fields (a test checks the snapshot).

## Decisions worth a reviewer's eye

- Work groups follow the brief (Torah, Nevi'im, Kesuvim, Mishnah, Bavli, Yerushalmi, Midrash,
  Zohar, Rishonim, Acharonim+Chassidus) plus three: **Targum**, **Tefillah and Piyut** (siddur,
  machzor, zemiros, Haggadah) and **Other** (Josephus, Masorah). Order inside Rishonim/Acharonim is
  roughly chronological.
- Shmuel, Melachim and Divrei HaYamim are one work each; refs keep I/II apart in sort order.
- Commentaries on Chumash (`Rashi on Bereishis`, `Ramban on Shemos`) belong to the commentator's
  work; the ref parser keeps the base book as `baseWorkKey`.
- `Toras Moshe`, `Shaarei Teshuvah` and `Shomer Emunim` are ambiguous; each row has a `note`.
- Person merging drops one honorific (HaMelech, HaNavi, Avinu…) and "the", so `Shmuel` merges
  with `Shmuel HaNavi`. People who must stay apart (`Shimon HaTzaddik`, `Shmuel (Amora)`) are
  `exactOnly` rows.
- Concept keys are not pretty (consonantal transliteration + hash). They are stable; a reviewer who
  wants readable concept URLs should decide that before launch, since changing them renames pages.
