# @emunas/corpus

The shared data layer (integration-plan §1.2, §5). It reads `data/`, which belongs to the pipeline and is read-only here, and writes `.corpus/`. Both apps read only `.corpus/` and `@emunas/corpus/public`.

| Entry | For | Contents |
|---|---|---|
| `@emunas/corpus/public` | browsers and apps | `PublicShiur` and the other output types, `toLocal`/`toGlobal`/`offsetsFor`, `momentId`/`parseMomentId`, `ENTITY_THRESHOLDS`, `audioPath`, `SCHEMA_VERSION`. Has no Node imports. |
| `@emunas/corpus/build` | Node build steps only | `buildCorpus`, `projectCorpus`, the allow-listed reader, valibot schemas, the status gate, the projector, the `Keyer` interface with its default `identitySlugKeyer`, and the report. ESLint blocks app code from importing it. |
| `@emunas/corpus/transcript-gate` | the transcript view (W5.2), currently off | `readEligibleTranscript(recordingId)` |

## `npm run corpus:build`

```
npm run corpus:build -- [--data-dir data] [--out .corpus] [--suppress .corpus/suppress.json] [--policy-dir site-policy] [--force]
```

Defaults: data comes from `EMUNAS_DATA_DIR` or `<repo>/data`, output goes to `<repo>/.corpus`, policy from `<repo>/site-policy`. Relative paths resolve against the directory npm was started from. Exit code 1 means invalid ingest, manifest or policy. Exit code 2 means a bad flag. On today's data a full build takes about 1.5 s.

Output: `build.json`, `shiurim/<id>.json` (one per in-scope shiur), `index.json` (rows plus catalog sections and series), `audio-table.json` (`recordingId → {size, canonicalId}`), `build-report.json`, `.fingerprints.json`. A shiur file is rewritten only when its fingerprint changes. The fingerprint covers the ingest row, recordings, manifest entry, meta/extraction/writeup bytes, keyer id and version, policy thresholds, the shiur's suppress ids, the schema version and a hash of this package's projection source. The other outputs are rewritten only when their content changes.

## Rules implemented here

- **Reading** (`src/build/read.ts`): every path is matched against `DATA_ALLOW_LIST`, which covers ingest, manifest, `shiurim/<id>/{meta,extraction,writeup}.json` and the two catalog JSONs. Any other path throws `ForbiddenPathError`. Only `src/transcript-gate.ts` knows where transcripts live.
- **Status gate** (C4, `src/build/gate.ts`): a shiur is `full` only if the manifest says `done`, all three files parse and validate, `extractionVariant === "extraction"`, and the structural checks pass. Those checks are: meta recordings equal the shiur's recordings, sections tile every recording, recording ids are the shiur's own, and write-up `sectionIndex`/`sourceIdx` are in range. Otherwise the shiur is `catalog-only` and gets a report entry. Only an invalid ingest or manifest is fatal.
- **Projection** (`src/build/project.ts`): copies fields one by one and never strips. Items with confidence below `dropBelow` (0.6) are dropped. Items below `softBelow` (0.75) get `soft: true`. Sources with `unresolved` resolution and `work: null` are dropped, and write-up `src` is remapped to the filtered list. Suppressed ids (from publish-policy `suppress` and `--suppress`) remove the item. For chapters, one-liners and abstracts they blank the summary text instead.
- **Time** (C5/C6, `src/build/time.ts`): all times are global seconds. An item's `t` is `starts[min seg]` and its `end` is `ends[max seg]`. The recording is `evidence.recordingId`, else the section's recording (write-up only), else the only recording. Chapters tile `[0, duration]` exactly. Write-up paragraph times use the paragraph's evidence inside its section and are clamped to the section. Noise segments become `skip` ranges. An item whose time cannot be resolved keeps `t: null` and is reported.
- **Moment ids**: `<shiurId>~<kind><index>`, with kinds `kp s i tk q st src ol ab`. Write-up paragraphs use `wen`/`wyi` plus `<block>.<paragraph>`. Indices are positions in the raw extraction.
- **Keys**: all key fields go through `Keyer`. The default `identitySlugKeyer` folds a value to a slug and reports every value as unmapped. W2.1 swaps in `@emunas/normalize`.

## Tests and fixtures

`npm test` runs golden, gate, projection, CLI and transcript-gate tests on the fixtures, plus the acceptance checks on the repo's real `data/`.

- `test/fixtures/mini/data`: 60 in-scope shiurim (31 done) and 2 out-of-scope rows, including the 7 sample shiurim and every multi-recording shiur. It holds derived text only: `heardAs`/`asrNotes` are blanked, transcript keys are nulled and audio keys are synthetic.
- `test/fixtures/golden/<id>.json`: the projected output of the 7 samples, with `rev` set to `"<rev>"`.
- To regenerate both: `npm run fixtures:mini --workspace=@emunas/corpus`, or add `-- --golden-only` to rebuild just the goldens after an intended output change. Review the diff before committing.
