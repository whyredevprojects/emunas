# Batch runbook: production P4 + P4b run

Instructions for a Claude session that wakes up on a schedule to process the next batch of shiurim. Follow the steps in order. Don't improvise around a failure: when a step says stop, stop and report.

**What a batch is.** Each in-scope shiur (959) has an entry in `data/derived/manifest.json` with a status: `pending`, `in_progress`, `done`, `failed` (2 failed attempts) or `needs_review` (flagged by an audit or by hand). One Opus agent per **group** reads the shiur's transcript once and writes both outputs, extraction (P4) and write-up (P4b), into `data/derived/shiurim/<shiurId>/`, following `prompts/run-shiur.md`. Shiurim under 15 minutes are grouped up to 3 per agent. Code prepares the inputs (with ASR noise marked `[NOISE?]`), validates the outputs and keeps the manifest. There is no cleanup pass.

**Batch size.** Default **N = 60** shiurim per run (about 55 agents, waves of up to 18 concurrent; measured ~155k subagent tokens per shiur, ~153k per audio hour, so ~7-8M per run, about 55-60% of a session window). Use a different N only if the person who scheduled the session said so.

**Yiddish re-transcription (2026-11-13):** the hold is lifted. `batch:next` itself skips any Yiddish shiur whose transcript is not yet re-transcribed (`mode: careful`); a separate refresh task pulls newly finished transcripts into the repo between runs. Run `batch:next` without `--lang`.

## Steps

### 1. Branch and pull
All work happens on branch `claude/vibrant-curie-ioreux`:
```
git fetch origin claude/vibrant-curie-ioreux
git checkout -B claude/vibrant-curie-ioreux origin/claude/vibrant-curie-ioreux
npm ci --silent
```
If it fails (conflict, diverged branch), **stop** and report the error. Don't resolve it yourself.

### 2. Reset stale work
```
npm run -s batch:reset-stale
```
Shiurim left `in_progress` for more than 12 hours (a crashed session) go back to `pending`. If `npm run -s batch:status` still shows `in_progress` shiurim after this, another session may be running: **stop** and report (don't start a second batch on top).

### 3. Pick the batch
```
npm run -s batch:next -- 60
```
It picks the next pending shiurim (fixed order, languages interleaved), writes their `input.txt` and `meta.json`, marks them `in_progress`, and prints:
- `BATCH <batchId>: ...` and one `GROUP <n>: <ids>` line per agent;
- for each group, the filled-in agent prompt between `----- AGENT PROMPT, GROUP <n> ... -----` and `----- END GROUP <n> -----`.

If it prints "No pending shiurim", skip to step 7 (commit nothing new) and report that the corpus is finished. If it exits with an error about prompt versions or in_progress shiurim, **stop** and report.

### 4. Run the agents
For each group, launch one background agent with the **Agent tool**:
- `model`: `"opus"`
- `run_in_background`: `true`
- `description`: `"shiur <ids>"` (as printed)
- `prompt`: the group's filled-in prompt **exactly as printed** (the template below, filled).

Keep **at most 18 agents running at once**. Start with groups 1..18; each time one finishes, record its usage (step 6) and launch the next group, until every group has finished. Don't do the agents' work yourself and don't fix their files: an agent that fails or reports FAIL is handled by step 5 (its shiurim go back to pending for one more attempt).

The template (from `prompts/run-shiur.md`; `batch:next` fills `{{COUNT}}`, `{{SHIUR_IDS}}`, `{{REPO}}`):

```text
You are processing {{COUNT}} shiur(im) of Harav Moshe Wolfson for the emunas data pipeline: {{SHIUR_IDS}}.

Repository: {{REPO}}. Work only inside it; all paths below are relative to it.

Read prompts/run-shiur.md and follow it exactly, for each shiur id above, one after the other: read data/derived/shiurim/<id>/input.txt, write and validate extraction.json, run the word budget, write and validate writeup.json (at most 2 fix rounds per file).

Use only the file tools (Read, Write, Edit, Glob, Grep) and Bash inside the repository. Do not use any other tool (no agents, sessions, messages, web, MCP or connector tools), do not run git, and write no files other than data/derived/shiurim/<id>/extraction.json and writeup.json for these ids.

When done, reply only with the per-shiur result lines defined at the end of prompts/run-shiur.md.
```

### 5. Finalize
After **all** agents of the batch have finished:
```
npm run -s batch:finalize
```
It validates every `in_progress` shiur (both files, current prompt versions, model opus). Passing → `done`. Failing → back to `pending` with `attempts + 1`, or `failed` after 2 failed attempts. It prints one line per shiur and a summary.

### 5b. Spot-check (one blind audit per batch)
```
npm run -s batch:pick-audit
```
prints one random `done` shiur without an audit (if none, skip). Launch **one** Opus agent in the **foreground** (`model: "opus"`, `run_in_background: false`, `description: "audit <shiurId>"`), so its result and usage come back directly with this prompt, `<shiurId>` and `<REPO>` filled in:

```text
Audit one finished shiur of the emunas data pipeline: <shiurId>.

Repository: <REPO>. Work only inside it; all paths are relative to it.

Read prompts/audit.md and follow it exactly. Inputs are in data/derived/shiurim/<shiurId>/ (input.txt, extraction.json, writeup.json); write your result only to data/derived/audits/<shiurId>.json.

Use only the file tools (Read, Write, Edit, Glob, Grep) and Bash inside the repository. Do not use any other tool (no agents, sessions, messages, web, MCP or connector tools), do not run git, and write no other file.

When done, reply only with the one result line defined at the end of prompts/audit.md.
```

When it finishes, read `data/derived/audits/<shiurId>.json`. If `severity` is `"serious"`:
```
npm run -s batch:mark -- <shiurId> needs_review "audit: <first note, short>"
```
Never wait on a task notification for more than 15 minutes, for the audit or any run agent: worker restarts can drop them. If one hasn't arrived, check the agent's output file on disk (the audit JSON, or the shiur's extraction.json/writeup.json); if the work is there, log its usage as `0 0 0` with result `no-usage` and continue to step 7. Committing what's done always beats waiting.

### 6. Log token usage
Each finished agent's result ends with its usage (total tokens, tool uses, duration). For every run agent, as it finishes:
```
npm run -s batch:usage -- run <group> <totalTokens> <toolUses> <durationMs> <OK|FAIL|partial>
```
(`OK` when every line of its reply says OK.) For the audit agent:
```
npm run -s batch:usage -- audit <shiurId> <totalTokens> <toolUses> <durationMs> <severity>
```
This appends to `data/derived/usage.tsv` (date, batch, pass, group, shiurIds, model, tokens, tool_uses, duration_ms, result). If an agent's usage is not shown, log `0 0 0` with result `no-usage`.

### 7. Commit and push
```
npm run -s batch:status
git add data/derived/manifest.json data/derived/usage.tsv data/derived/shiurim data/derived/audits
git commit -m "Batch <batchId>: <done> done, <pending> retry, <failed> failed"
git push -u origin claude/vibrant-curie-ioreux
```
Push to `claude/vibrant-curie-ioreux` only. If the push is rejected because the remote moved, run `git pull --rebase` once and push again. If the rebase stops on a conflict in `data/derived/manifest.json` only (a transcript refresh landed meanwhile), resolve it by taking this batch's version (`git checkout --theirs data/derived/manifest.json` during the rebase), then run `npm run -s batch:init` to re-apply the refreshed transcript info, `git add data/derived/manifest.json`, `git rebase --continue`, and push. Any other conflict: `git rebase --abort`, push to a new branch `claude/batch-<batchId>`, and report. Never force-push.

### 8. Report
One paragraph: batch id; shiurim done / back to pending / failed this run; overall status counts (done of 959, hours done); total tokens this run (sum of the usage rows) and tokens per audio hour; the audit result (shiur, severity, the worst note); anything that stopped the run.

## Rules for the session
- Only the commands above, the Agent tool for the agents in steps 4 and 5b, and file reads. Don't edit prompts, scripts or outputs; don't change the manifest except through `npm run batch:*`.
- Never launch an agent with any model other than `opus`, and never put anything into an agent prompt beyond the printed text.
- If something not covered here goes wrong, finalize what finished (step 5), commit (step 7), and report.

## Reference
- `npm run -s batch:status`: counts by status, language and hours.
- `npm run -s validate -- data/derived/shiurim/<id>/extraction.json data/derived/shiurim/<id>/writeup.json`: validator report for one shiur.
- `npm run -s writeup:budget -- <id>`: per-section write-up word budget.
- `npm run -s noise:report`: corpus-wide ASR noise counts.
- `npm run -s batch:mark -- <id> <status> [note]`: manual status change (`pending` also resets attempts).
- `npm run batch:init`: refresh the manifest from `data/derived/ingest.json` (keeps existing entries; `-- --reset` sets all to pending).
