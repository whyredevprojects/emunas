/**
 * Build-time feature flags of the Live app (tech-live §3.5; integration-plan §0.3, C17; W5.2).
 *
 * TRANSCRIPT_VIEW — the Transcript tab of the listening room. Designed, OFF.
 * A compile-time constant: `vite.config.ts` defines `__EMUNAS_TRANSCRIPT_VIEW__` as the literal `true`
 * only when the build runs with EMUNAS_TRANSCRIPT_VIEW=on, and `false` otherwise. Every use of the
 * transcript feature is written as `TRANSCRIPT_VIEW && …` / `if (TRANSCRIPT_VIEW)`, so with the
 * default the bundler folds the condition and drops `app/features/transcript/**` from the client
 * bundle entirely (asserted by `features/transcript/bundle.test.ts` and the e2e bundle grep).
 * Outside a Vite build (unit tests) the define is absent and the flag is false.
 *
 * Even with the flag on, a tab appears only for a recording whose public file
 * `/data/transcript/<recordingId>.json` was emitted, which needs an approved entry in
 * `site-policy/transcript-eligibility.json` matching the current transcript (the transcript gate).
 */
declare const __EMUNAS_TRANSCRIPT_VIEW__: boolean | undefined;

export const TRANSCRIPT_VIEW: boolean =
  typeof __EMUNAS_TRANSCRIPT_VIEW__ === "boolean" ? __EMUNAS_TRANSCRIPT_VIEW__ : false;

/** The `define` entry for vite.config.ts (kept here so the name and the rule live in one place). */
export function transcriptViewDefine(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return { __EMUNAS_TRANSCRIPT_VIEW__: JSON.stringify(env["EMUNAS_TRANSCRIPT_VIEW"] === "on") };
}
