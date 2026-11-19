# Translation runbook (P4c)

How a session translates the published shiur and corpus text into a further content language (`TRANSLATION_LANGS` in `src/types.ts`; today `he`). The agent contract is `prompts/p4c-translate.md`; the code is `scripts/translate.ts`.

Translations are overlays. They never change `extraction.json`, `writeup.json` or the corpus files; they sit next to them and are keyed by the path of the text they translate:

| What | Where |
|---|---|
| One shiur | `data/derived/shiurim/<shiurId>/i18n/<lang>.json` (`ShiurTranslation`) |
| Corpus text (concepts, stories, topics, teaching clusters, people, series) | `data/derived/corpus/i18n/<lang>/<part>.json` (`CorpusTranslation`), any number of parts |

Each file records the hash of the en/yi text it was made from. When the pipeline rewrites a shiur or a corpus entry, its translation shows up as **stale** in `status` and is translated again. The sites fall back to Yiddish for any text that has no current translation.

Translation reads only the published en/yi text. It never reads the transcript, `input.txt`, or the raw extraction fields (`heardAs`, `asrNotes`).

## Commands

```
npm run -s translate -- status he                          # counts: done / stale / missing
npm run -s translate -- status he --missing --shard 2/5    # shiur ids still to do in shard 2 of 5
npm run -s translate -- source he <shiurId...>             # writes out/translate/he/shiurim/<id>.json
npm run -s translate -- corpus-source he                   # splits corpus work into out/translate/he/corpus/<part>.json
npm run -s translate -- validate <file...>                 # checks translation files
```

`out/translate/` is scratch (gitignored); regenerate it in each session.

## A translation session

1. Check out the working branch, `npm ci`, read this file and `prompts/p4c-translate.md`.
2. List the work: `npm run -s translate -- status he --missing --shard k/N` (or `corpus-source he` for the corpus). Shards are taken over all shiur ids, so N sessions with shards 1/N … N/N never overlap.
3. Prepare sources for the next groups: `npm run -s translate -- source he <ids...>`.
4. Launch subagents (Opus), each with one group: 3–4 shiurim, or 1–2 corpus parts. Run several at once. Each gets the prompt below.
5. When a subagent finishes, run `npm run -s translate -- validate` on its outputs yourself. A file with errors goes into the next group once more; after two failures, leave it and list it in the session's report.
6. Commit the validated files (`data/derived/**/i18n/**` only) and push after every few groups, so nothing is lost if the session stops. Never commit `out/`.
7. Repeat until `--missing` for the shard is empty, then report the counts from `status` and any failures.

Start with one group alone and read its output against `prompts/hebrew-style.md` before launching the rest in parallel.

## Agent prompt template

```text
You are translating {{COUNT}} item(s) of the emunas shiurim corpus (Harav Moshe Wolfson zt"l) into Hebrew (he): {{ITEMS}}.

Repository: {{REPO}}. Work only inside it; all paths below are relative to it.

Read prompts/p4c-translate.md and prompts/hebrew-style.md and follow them exactly. For each shiur id, the source is out/translate/he/shiurim/<id>.json and the output is data/derived/shiurim/<id>/i18n/he.json. For each corpus part, the source is out/translate/he/corpus/<part>.json and the output is the path in its "output" field. Validate each output with npm run -s translate -- validate <file> (at most 2 fix rounds).

Use only the file tools and Bash inside the repository. No other tools, no git, and never open data/transcripts, input.txt, extraction.json or writeup.json. Write no files other than the outputs for these items. Use "model": "opus".

When done, reply only with the result lines defined at the end of prompts/p4c-translate.md.
```

## Adding another language

1. Add it to `TranslationLang` / `TRANSLATION_LANGS` in `src/types.ts` and its text rules to `RULES` in `scripts/translate.ts`.
2. Write `prompts/<language>-style.md` and name it in `prompts/p4c-translate.md`.
3. Add the language to the sites (`UI_LANGS` in `@emunas/i18n`), then run translation sessions as above.
