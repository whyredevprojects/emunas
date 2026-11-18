/**
 * Planted leaks for the chain's self-test (corpus-wave-plan C3.8 acceptance): each plant edits one
 * file of the built corpus layer so that the guard post-pass must fail, and gives back a function
 * that puts the file back exactly as it was.
 *
 * - `asr-key`: an `asrVariants` key on the first person of `.corpus/layer/people.json` (the guard's
 *   forbidden-key rule; the value is a harmless placeholder).
 * - `asr-synonym`: an ASR variant added to the first synonym entry of `.corpus/layer/synonyms.json`
 *   that it is not a display name of (the guard's raw ban). The variant is read through
 *   `@emunas/corpus-guard` (the only package that may open the variant dump) and is never printed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AliasRules, isEntityKind, readAsrVariants } from "@emunas/corpus-guard";

export const PLANTS = ["asr-key", "asr-synonym"] as const;
export type Plant = (typeof PLANTS)[number];

export function isPlant(v: string): v is Plant {
  return (PLANTS as readonly string[]).includes(v);
}

export interface Planted {
  /** The file that was changed (relative to the corpus dir). */
  file: string;
  /** What was planted, without the planted text itself. */
  what: string;
  /** Writes the original bytes back. */
  restore: () => void;
}

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function edit(path: string, change: (v: unknown) => string): () => void {
  const original = readFileSync(path);
  const next = change(JSON.parse(original.toString("utf8")) as unknown);
  writeFileSync(path, next);
  return () => writeFileSync(path, original);
}

/** Plants `kind` into the layer under `corpusDir`; `corpusDataDir` supplies the ASR variants. */
export function plant(kind: Plant, corpusDir: string, corpusDataDir: string): Planted {
  const layer = join(corpusDir, "layer");
  if (kind === "asr-key") {
    const file = join(layer, "people.json");
    const restore = edit(file, (v) => {
      const people = isRecord(v) && Array.isArray(v["people"]) ? v["people"] : null;
      const first: unknown = people?.[0];
      if (!isRecord(first)) throw new Error(`plant asr-key: no person in ${file}`);
      first["asrVariants"] = ["planted"];
      return `${JSON.stringify(v)}\n`;
    });
    return { file: "layer/people.json", what: "an asrVariants key on the first person", restore };
  }
  const file = join(layer, "synonyms.json");
  const rules = AliasRules.read(corpusDataDir);
  const variants = readAsrVariants(corpusDataDir);
  let target = "";
  const restore = edit(file, (v) => {
    const rows = isRecord(v) && Array.isArray(v["synonyms"]) ? v["synonyms"] : null;
    if (!rows) throw new Error(`plant asr-synonym: no synonyms in ${file}`);
    for (const row of rows) {
      if (!isRecord(row) || typeof row["id"] !== "string" || typeof row["kind"] !== "string") continue;
      const kindOf = row["kind"];
      if (!isEntityKind(kindOf) || !Array.isArray(row["terms"])) continue;
      const id = row["id"];
      const term = variants.find((t) => rules.check({ kind: kindOf, id }, t)?.rule === "asr-variant");
      if (term === undefined) continue;
      (row["terms"] as unknown[]).push(term);
      target = `${kindOf}:${id}`;
      return `${JSON.stringify(v)}\n`;
    }
    throw new Error("plant asr-synonym: no ASR variant that is not already a display name (is the variant dump empty?)");
  });
  return { file: "layer/synonyms.json", what: `one ASR variant as a synonym of ${target}`, restore };
}
