/** Reading `.corpus/` (output of `corpus:build`, integration-plan §5.1) for the guard. */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { collectShiurItems, type CollectOptions, type ShiurUnits } from "./items.ts";
import { readLayerUnits } from "./layer.ts";

/** Files `.corpus/shiurim/*.json`, sorted. */
export function listCorpusShiurFiles(corpusDir: string): string[] {
  const dir = join(corpusDir, "shiurim");
  if (!existsSync(dir)) throw new Error(`${dir} not found: run corpus:build first`);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(dir, f));
}

/** Shipped units of every shiur in `.corpus/`. Unreadable files are returned as errors, not thrown. */
export function* readCorpusUnits(
  corpusDir: string,
  opts: CollectOptions = {},
): Generator<{ file: string; units: ShiurUnits | null }> {
  for (const file of listCorpusShiurFiles(corpusDir)) {
    let units: ShiurUnits | null;
    try {
      units = collectShiurItems(JSON.parse(readFileSync(file, "utf8")), opts);
    } catch {
      units = null;
    }
    yield { file, units };
  }
}

/** shiurId → recording ids, from `.corpus/shiurim/*.json`. */
export function readShiurRecordings(corpusDir: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { units } of readCorpusUnits(corpusDir)) if (units) out.set(units.shiurId, units.recordingIds);
  return out;
}

/**
 * Texts of allow-listed items, shiur items and corpus-layer units alike (used so a reviewed run that
 * also appears in HTML/JS does not fail the post-pass).
 */
export function readAllowedTexts(corpusDir: string, allow: ReadonlySet<string>): string[] {
  if (allow.size === 0) return [];
  const out: string[] = [];
  for (const { units } of readCorpusUnits(corpusDir, { skipTopLevel: [] })) {
    if (!units) continue;
    for (const item of units.items) if (allow.has(item.id)) out.push(item.text);
  }
  for (const u of readLayerUnits(corpusDir).units) if (allow.has(u.id)) out.push(u.text);
  return out;
}
