# site-policy

Human-edited policy files read by the site build (`@emunas/corpus`, `@emunas/corpus-guard`).
Every change here is reviewed in a pull request. See `docs/sites/integration-plan.md` §0, §1.4 (C7, C8, C11, C17), §4 and §6.

## transcript-eligibility.json

Ships as `{ "policyVersion": 1, "eligible": {} }`: no recording has a public transcript view.

A transcript view for a recording needs **both** an entry here **and** the build flag
`EMUNAS_TRANSCRIPT_VIEW=on` (default off). Entries are keyed by `recordingId`:

```json
{
  "model": "…", "mode": "…", "transcribedAt": "…",
  "quality": "reviewed",
  "approvedBy": "…", "approvedAt": "YYYY-MM-DD",
  "allowSearch": false,
  "note": "…"
}
```

`model`, `mode` and `transcribedAt` must equal the compact transcript's top-level fields, so a
re-transcription voids the approval. `quality` is `"reviewed"` or `"high-asr"`. `allowSearch`
stays `false` (owner decision O1). Only `packages/corpus/src/transcript-gate.ts` reads this
together with the transcript.

## publish-policy.json

| Field | Meaning |
|---|---|
| `policyVersion` | Schema version of this file (1). |
| `confidence.dropBelow` | Items with `confidence` below this are not published (0.6). |
| `confidence.softBelow` | Items from `dropBelow` up to (not including) this get `soft: true` (0.75). Quiet may ignore `soft`. |
| `categoryVisibility.<category>` | Per-category placement. Default for `current` and `simcha` (owner decision O7): own section, not in general browse, excluded from Live's Today and Explore defaults. Categories not listed are shown everywhere. |
| `suppress[]` | `{ "id": "<item or moment id>", "reason": "…" }` – derived items unpublished by hand or by the verbatim guard. |
| `allowVerbatim[]` | `{ "id": "<item id>", "reason": "…" }` – items a person reviewed and accepted despite a verbatim-guard hit. |

## verbatim-allow.json

An array of `{ "id": "<item id>", "reason": "…", "reviewedBy": "…", "reviewedAt": "YYYY-MM-DD" }`
used by `@emunas/corpus-guard` for reviewed verbatim exceptions. Ships empty. Reports and this
file carry ids only, never transcript text.

## meta-comment-allow.json

An array of `{ "file": "<post-pass source path>", "term": "<term as listed>", "reason": "…", "reviewedBy": "…", "reviewedAt": "YYYY-MM-DD" }`:
reviewed exceptions to the guard's check for remarks on the transcript or the shiur itself
(`packages/corpus-guard/src/meta-comment.ts`). `file` is the path as the guard report prints it
(for NDJSON, without `:line`). A term not on the list or an incomplete entry is fatal. Ships empty:
reword the text instead wherever possible.

## audio-transcoded.json

`{ "policyVersion": 1, "mp3Siblings": ["<original .WMA key>", …] }`. Ships with an empty list.
Each key is a non-mp3 bucket key that has an MP3 transcode next to it (same key, extension `.mp3`),
added by `npm run transcode:wma --workspace=@emunas/audio` after a verified upload
(`docs/sites/ops-runbook.md` §10). The corpus build links the `.mp3` for listed keys only; every
other non-mp3 recording stays unplayable. An `.mp3` key, a key without an extension or a key that
may not become a URL is fatal.

## audio-cleaned.json

`{ "policyVersion": 1, "rejected": [{ "key": "<served key>", "reason": "…", "reviewedBy": "…", "reviewedAt": "YYYY-MM-DD" }, …] }`.
Ships with an empty list. Every playable recording has an AI-improved copy at
`fixed/sidon/<served key>` in the bucket, and the corpus build links it as `cleanedUrl`, unless its
served key (the `.mp3` that is linked: the key itself, or the transcode of a listed `.WMA`) is
rejected here; then `cleanedUrl` is `null` and the sites play only the original. Duplicates follow
their canonical. A key that is not the served `.mp3` key of a known recording, a key listed twice,
an unknown field or an empty `reason`/`reviewedBy` is fatal. Rejections are whole-recording only.
Check that the copies exist with `npm run cleaned:verify --workspace=@emunas/audio`
(`docs/sites/ops-runbook.md` §11; design in `docs/sites/cleaned-audio-ux.md`).

## corpus-policy.json

The owner's decisions for the corpus-wide layer (`docs/sites/corpus-wave-plan.md` §2),
read by `@emunas/corpus` (`packages/corpus/src/layer/policy.ts`). It ships with the conservative
defaults, which are also the defaults in code: a missing file means exactly these values. Every key
is optional (a missing key takes its default), but an unknown key, a wrong type or an invalid
pattern is fatal, since this is a reviewed file. Flipping a decision is a one-line edit plus a
rebuild.

| Field | Default | Meaning |
|---|---|---|
| `policyVersion` | `1` | Schema version of this file. Required. |
| `search.asrVariants` | `false` | D1. ASR variants are never read or indexed. `true` fails the build (it needs the evaluated server-side boost, Live I.13). |
| `people.other.pages` | `false` | D2. People of type `other` (and `individual`, private persons from stories) get no page on either site. |
| `people.other.quietLineMinShiurim` | `3` | D2. Quiet lists a type-`other` person as an index line from this many visible shiurim. |
| `people.other.liveListed` | `false` | D2. Live gives type-`other` people no index entry and no suggestion. |
| `people.excludeFamily` | `true` | D5. The Mashgiach's family is not listed, has no page and no suggestion. |
| `people.familyPattern` | `\bthe Mashgiach'?s\b` | D5. Matched case-insensitively against the person's own `nameEn` and `aliases` (or future `family`/`private` flags). A rule, never a list. |
| `people.excludeIds` | `[]` | D5. Person ids the owner excludes by hand. Ships empty. |
| `threads.pageMinShiurim` | `3` | D3. A teaching cluster needs this many distinct visible shiurim for a page. |
| `threads.twoMember` | `"inline-line"` | D3. Two-member clusters only produce an inline line at the insight (`"none"`: nothing). |
| `threads.timelineMinDated` | `3` | D3. Dated members needed for a thread's timeline. |
| `visibility.followCategoryVisibility` | `true` | D6. Story tellings and cluster members from categories with `generalBrowse: false` in `publish-policy.json` do not count. |
| `featured.maxOtherSpeakerShare` | `0.5` | D7. Shiurim at or above this share of another speaker are not featured (hubs, Today). |
| `featured.excludeTopicIds` | `[]` | D7. Topics the owner keeps out of featured slots. Ships empty. |
| `live.threadPagesIndexable` | `false` | D8. Live thread pages are `noindex` with no canonical. |
| `unknownVersion` | `"warn"` | D9. An unknown corpus `index.json` version warns and is validated by shape (`"fail"`: the build fails). |
| `thresholds.quiet.*` | see file | D10. Quiet: topic gateway layout above 150 shiurim; concept page from 5, "throughout" above one shiur in 7 (`conceptPassimOneIn`); person page from 3, full list on `all/` from 100; work page from 2; story page from 2 tellings. |
| `thresholds.live.*` | see file | D10. Live: person page from 3; concept page from 3, facet dropped above one shiur in 4 (`conceptFacetDropOneIn`); work page from 3; story page from 2 tellings. Thread pages use `threads.pageMinShiurim`. |
| `occasionTopic.minShare` | `0.5` | D11. Derived occasion → topic link: the level-2/3 topic must hold at least this share of the occasion's shiurim. |
| `occasionTopic.minSalience` | `0.6` | D11. Salience at which a shiur counts toward that share. |

All counts above are recomputed from the visible set (shiurim that are `full` in `.corpus` and in
the corpus `index.json`), never read from `shiurCount` or `shiurIds.length`.
