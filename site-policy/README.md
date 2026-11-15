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

## audio-transcoded.json

`{ "policyVersion": 1, "mp3Siblings": ["<original .WMA key>", …] }`. Ships with an empty list.
Each key is a non-mp3 bucket key that has an MP3 transcode next to it (same key, extension `.mp3`),
added by `npm run transcode:wma --workspace=@emunas/audio` after a verified upload
(`docs/sites/ops-runbook.md` §10). The corpus build links the `.mp3` for listed keys only; every
other non-mp3 recording stays unplayable. An `.mp3` key, a key without an extension or a key that
may not become a URL is fatal.
