// Prompt versions. Each prompt file's first line names its version ("(prompt p4-v3)"); outputs record
// it in `promptVersion`, and batch:finalize only accepts outputs made with the current versions.
// Bump the constant AND the prompt header together whenever a prompt changes.
import { readFileSync } from "node:fs";

export const PROMPT_VERSIONS = {
  p4: "p4-v3",          // prompts/p4-extract.md
  p4b: "p4b-v2",        // prompts/p4b-writeup.md
  run: "run-shiur-v1",  // prompts/run-shiur.md (combined P4 + P4b agent)
  audit: "audit-v1",    // prompts/audit.md
} as const;

export const PROMPT_FILES: Record<keyof typeof PROMPT_VERSIONS, string> = {
  p4: "prompts/p4-extract.md",
  p4b: "prompts/p4b-writeup.md",
  run: "prompts/run-shiur.md",
  audit: "prompts/audit.md",
};

/** Throws when a prompt file's header does not carry the version constant above. */
export function checkPromptHeaders(): void {
  const bad: string[] = [];
  for (const [k, file] of Object.entries(PROMPT_FILES) as [keyof typeof PROMPT_VERSIONS, string][]) {
    const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
    if (!first.includes(`(prompt ${PROMPT_VERSIONS[k]})`)) bad.push(`${file}: header should contain "(prompt ${PROMPT_VERSIONS[k]})", is "${first}"`);
  }
  if (bad.length) throw new Error(`prompt version mismatch:\n  ${bad.join("\n  ")}`);
}
