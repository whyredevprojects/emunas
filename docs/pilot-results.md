# Pilot results (20 shiurim, 2026-11-12)

All outputs, blind X/Y pairs, keys and verdicts are under `out/pilot/<shiurId>/`; token usage per run is in `out/pilot/usage.tsv`.
LLM work was done by Claude subagents (Agent tool, model = sonnet / opus / haiku). Judges were Opus, blind (labels X/Y, random order, model fields stripped), and counted concrete errors against the transcript.

## Validator (code checks)
All 20 Sonnet extractions, 8 Opus, 4 Haiku, 4 cleaned, 20 Opus and 6 Sonnet write-ups pass with 0 errors (most needed 0–1 fix rounds).

## Blind judgments
| Comparison | Result | Typical concrete differences |
|---|---|---|
| Extraction: Opus vs Sonnet (8) | **Opus 8–0** (6 clear, 2 slight) | Sonnet misses ~5–8 cited sources vs ~1–2; 2–3 of 3 bad section boundaries vs ~0; more Germanized Yiddish (~6/8 bad sentences vs 1–2); more misread terms ("Ramban" for Ribono shel Olam, "Hallel and hiddur", wrong pasuk) |
| Extraction: Sonnet vs Haiku (4) | **Sonnet 3–1** | Haiku invents themes from misread words (גדושה→"pride"), swaps who-did-what, 4–6 unsupported claims per shiur |
| Raw vs cleaned transcript (4) | **Raw 2 (slight), cleaned 1 (slight, Chanukah), tie 1** — no consistent gain | Cleanup fixes only 14–29% of lines; the rest is unrecoverable. The one cleaned win was the run where cleanup changed the most (29%) |
| Write-up: Opus vs Sonnet (6) | **Opus 5–1** (2 clear, 3 slight) | Sonnet: wrong central answer (Toldos), misattributed sources (Ohr HaChaim→Arizal), unresolved arguments; Opus lost once on a reversed detail (Tefilah) |

No model hallucinated outright in extraction except Haiku. Caveat: the judge is Opus; it was told to count verifiable errors, which limits self-preference, but it isn't zero.

## Usage (subagent tokens, incl. ~80k fixed overhead per run)
| Pass | Model | Runs | Avg tokens/run | Tokens per audio-hour |
|---|---|---|---|---|
| Extraction | Sonnet | 20 | 117k | 163k |
| Extraction | Opus | 8 | 131k | 165k |
| Extraction | Haiku | 4 | 198k | 240k (more fix loops, rereads) |
| Cleanup + extraction | Sonnet | 4 | 104k | 217k |
| Write-up | Opus | 20 | 117k | 162k |
| Write-up | Sonnet | 6 | 124k | 144k |
| Judge | Opus | 21 | 98–131k | — |

Pilot total: 84 runs, ~10.4M tokens.

## Recommendation for the full run
- **Extraction (P4): Opus.** Wins every comparison; same token volume as Sonnet.
- **Write-up (P4b): Opus.** 5–1.
- **Drop P3 cleanup.** No measurable gain.
- **Haiku:** not for extraction; keep only for narrow checkable passes (claim verification, closed-list tagging) and re-test there.
- **Estimated full run:** ~924 shiurim × ~250k tokens (extraction + write-up) ≈ **230M subagent tokens**, plus verification and corpus-level passes. Fixed per-run overhead is ~80k, so batching several short shiurim per agent would cut this noticeably.

## Fixes before the full run
1. **Write-up length:** first drafts run 1.5–3× the target, costing a trim round almost every time. Give a per-section word budget in the prompt, or relax the target to what Opus naturally writes (~1,000 words/hour).
2. **Source resolution rule:** "inferred"/"resolved" with `ref: null` is the most common warning. Make the prompt require a ref for those states, or allow `inferred` without one and fix the validator.
3. **Abstract length:** Yiddish abstracts often run 150–175 words; loosen to 180 or tighten the prompt.
4. **ASR hallucination flags:** long silent/garbage segments (e.g. 13-minute single segment, repeated "און") should be detected in code and marked `noise` before the model sees them.
5. **`check-cleaned` CLI** takes the file path, not the directory (moot if P3 is dropped).
6. **Agent hygiene:** two Haiku agents tried stray tools (archive_session, send_message); both were denied. Keep the "only file and shell tools in the repo" line in every agent prompt.
