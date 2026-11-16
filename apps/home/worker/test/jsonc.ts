import { readFileSync } from "node:fs";

/**
 * Reads a wrangler.jsonc written in this repo's style: comments only on their own lines,
 * no trailing commas. Throws (via JSON.parse) on anything else, so the style is enforced.
 */
export function readJsonc(path: string): unknown {
  const text = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
  return JSON.parse(text) as unknown;
}
