# Run one or more shiurim end to end: extraction (P4), then write-up (P4b) (prompt run-shiur-v1)

You are a Claude agent in the emunas data pipeline. For each shiur id in your task message you produce two files, the **extraction** and the **write-up**, from one reading of its transcript, and you validate both. You work alone and unattended: nobody will answer questions, so follow this file exactly and finish.

## Hard rules

- **Tools.** Use only the file tools (Read, Write, Edit, Glob, Grep) and Bash, and only inside the repository directory named in your task message. Do **not** use any other tool: no agents or subagents, no sessions or messages, no web or fetch, no MCP or connector tools, no scheduling, no artifacts. If a tool is denied, do not try another one in its place.
- **Bash** only for the two npm commands below (and `wc`, `head`, `sed -n`, `grep` to read files). No `git`, no network, no package installs, no `batch:*` scripts, no deleting or moving files.
- **Write only** `data/derived/shiurim/<shiurId>/extraction.json` and `data/derived/shiurim/<shiurId>/writeup.json` for the ids in your task. Never edit `input.txt`, `meta.json`, prompts, scripts or anything else.
- Fixed values: `"model": "opus"`, `"variant": "raw"`, extraction `"promptVersion": "p4-v3"`, write-up `"promptVersion": "p4b-v2"` and `"extractionVariant": "extraction"`.

## Once, before the first shiur

Read these three files in full; they are the actual instructions for the two outputs:

1. `prompts/p4-extract.md` (the extraction contract and rules)
2. `prompts/p4b-writeup.md` (the write-up contract and rules)
3. `prompts/yiddish-style.md` (how every Yiddish sentence must look)

## For each shiur id, in order

Let `D = data/derived/shiurim/<shiurId>`.

1. **Read `D/input.txt` completely**: the header, then every transcript line. For a long file, read it in consecutive chunks (Read with `offset`/`limit`) until the end; do not skip or sample. You will not get a second chance to read it cheaply, so note as you go: catalog topics, turns in the argument, sources, stories, questions, `[NOISE?]` stretches.
2. **Earlier attempt?** If `D/extraction.json` already exists (a previous attempt failed), run the validator on it (step 4's command). If it passes with no errors and has `"promptVersion": "p4-v3"`, keep it and go to step 5. Otherwise write a new one.
3. **Extraction (P4).** Following `p4-extract.md`, write `D/extraction.json`.
4. **Validate the extraction:**
   `npm run -s validate -- data/derived/shiurim/<shiurId>/extraction.json`
   Fix every `ERROR` by editing the file, then validate again. **At most 2 fix rounds.** Fix a `warn` only if it points at a real mistake (a source-rule warning: yes; a warning that published text mentions the transcript or calls the shiur garbled/unclear: yes, rewrite the sentence to say only what the Mashgiach teaches, unless the match is real content or a plain remark about the sound/recording; an abstract-length warning: no; a catalog topic you truly could not find: no, say so in `asrNotes`). If errors remain after 2 rounds, stop work on this shiur (skip the write-up) and report it as failed.
5. **Budget.** Run `npm run -s writeup:budget -- <shiurId>`. It prints the per-section word budget (per language) for the write-up, computed from your sections.
6. **Plan, then write the write-up (P4b).** Following `p4b-writeup.md` and the budget table: plan each block (its budget, the steps of the argument it covers), then write `D/writeup.json` in both languages from the transcript you already read. Re-read a section's stretch of `input.txt` (Read with `offset`/`limit`) when you need its detail; don't reread the whole file.
7. **Validate both:**
   `npm run -s validate -- data/derived/shiurim/<shiurId>/extraction.json data/derived/shiurim/<shiurId>/writeup.json`
   Fix every `ERROR` in the write-up (most likely: length, a missing block, evidence outside its section), then validate again. **At most 2 fix rounds.** A length error means trim or expand to the budget, not rewrite from scratch. Warnings: leave them all, except a warning that published text looks like a comment on the audio/transcript (fix it as in step 4); do not trim for length unless the validator reports an ERROR. Extra fix rounds cost more than slightly long text.
8. Move on to the next shiur id. Do not carry content from one shiur into another.

## When all ids are done

Reply with exactly one line per shiur and nothing else:

```
<shiurId> OK extraction <E>E/<W>W writeup <E>E/<W>W words en <n> yi <n> fixrounds <n>
<shiurId> FAIL <stage> <one-line reason>
```

(`E`/`W` = errors/warnings in the last validator run; `fixrounds` = total fix rounds for both files.) The session that launched you runs the final validation itself; your report is for its log.

## Agent prompt template

The session launching you fills this template (`npm run batch:next` prints it filled in for each group). The text between the markers must match `docs/batch-runbook.md`.

<!-- AGENT PROMPT TEMPLATE START -->
```text
You are processing {{COUNT}} shiur(im) of Harav Moshe Wolfson for the emunas data pipeline: {{SHIUR_IDS}}.

Repository: {{REPO}}. Work only inside it; all paths below are relative to it.

Read prompts/run-shiur.md and follow it exactly, for each shiur id above, one after the other: read data/derived/shiurim/<id>/input.txt, write and validate extraction.json, run the word budget, write and validate writeup.json (at most 2 fix rounds per file).

Use only the file tools (Read, Write, Edit, Glob, Grep) and Bash inside the repository. Do not use any other tool (no agents, sessions, messages, web, MCP or connector tools), do not run git, and write no files other than data/derived/shiurim/<id>/extraction.json and writeup.json for these ids.

When done, reply only with the per-shiur result lines defined at the end of prompts/run-shiur.md.
```
<!-- AGENT PROMPT TEMPLATE END -->
