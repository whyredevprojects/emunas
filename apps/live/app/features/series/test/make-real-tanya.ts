/**
 * Writes `real-tanya-yi.json`: the Live data file `/data/series/tanya-yi.json` exactly as the real
 * chain emits it (catalog parts, the series synthesis from the corpus layer: generated title,
 * overview, key themes and arc lines for the visible parts). The series page snapshot renders it.
 * Only public, generated output is copied; nothing here reads `data/`.
 *
 *   npm run corpus:build                                                     # from the repo root
 *   npx tsx apps/live/data-build/cli.ts emit --corpus .corpus --out <dir>/data --neighbors off
 *   npx tsx apps/live/app/features/series/test/make-real-tanya.ts <dir>/data
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.argv[2];
if (!dataDir) throw new Error("usage: make-real-tanya.ts <live data dir>");
const file = JSON.parse(readFileSync(join(dataDir, "series/tanya-yi.json"), "utf8")) as unknown;
writeFileSync(join(here, "real-tanya-yi.json"), `${JSON.stringify(file, null, 1)}\n`);
console.log("wrote real-tanya-yi.json");
