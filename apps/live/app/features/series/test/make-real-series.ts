/**
 * Writes `real-series.json`: the shape of the real series (ids, languages, and per part the
 * shiur id, catalog `seriesOrder` and perek), taken from `.corpus/series.json` (catalog data only; no
 * notes, no titles). The series tests run against it so "all 17 series ordered by seriesOrder" is
 * checked on the real catalog without the app reading `data/`.
 *
 *   npm run corpus:build                                        # from the repo root
 *   npx tsx apps/live/app/features/series/test/make-real-series.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CorpusSeriesFile {
  series: {
    id: string;
    lang: "yi" | "en";
    parts: { id: string; order: number | null; perek: string | null }[];
  }[];
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../../../..");
const src = JSON.parse(readFileSync(join(root, ".corpus/series.json"), "utf8")) as CorpusSeriesFile;
const out = src.series.map((s) => ({
  id: s.id,
  lang: s.lang,
  parts: s.parts.map((p) => ({ shiurId: p.id, order: p.order, perek: p.perek })),
}));
writeFileSync(join(here, "real-series.json"), `${JSON.stringify({ series: out }, null, 1)}\n`);
console.log(`wrote ${out.length} series`);
