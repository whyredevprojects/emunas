/**
 * Dev-only seed script (integration-plan §8 W1.3). Not imported by any runtime code.
 *
 * Reads the distinct catalog and derived values the alias tables must cover and writes them to
 * `packages/normalize/seed/*.json`, sorted and without timestamps, so the snapshot is
 * deterministic and reviewable in a diff. The tests in `test/coverage.test.ts` assert that every
 * value in these snapshots maps (or is explicitly listed as "other").
 *
 * Inputs (read-only):
 *   data/derived/ingest.json                       → Shiur.parsha, Shiur.zman (in-scope and out)
 *   data/derived/shiurim/<id>/extraction.json      → sources[].work, sources[].sefariaRef,
 *                                                    people[].name, stories[].people[], concepts[].he
 *
 * Only those fields are copied out. Nothing transcript-derived (heardAs, asrNotes, segment
 * indices, text) is ever written. This script never reads the pipeline's transcript folder.
 *
 * Usage: npm run seed -w @emunas/normalize [-- --data-dir <path>]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pkgDir, "../..");

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const dataDir = resolve(argValue("--data-dir") ?? join(repoRoot, "data"));
const outDir = join(pkgDir, "seed");

interface SeedValue {
  value: string;
  /** number of distinct shiurim the value occurs in */
  shiurim: number;
  /** number of occurrences */
  count: number;
}

interface SeedFile {
  source: string;
  note: string;
  values: SeedValue[];
}

class Tally {
  private readonly m = new Map<string, { shiurim: Set<string>; count: number }>();
  add(value: unknown, shiurId: string): void {
    if (typeof value !== "string" || value.length === 0) return;
    let e = this.m.get(value);
    if (!e) {
      e = { shiurim: new Set(), count: 0 };
      this.m.set(value, e);
    }
    e.shiurim.add(shiurId);
    e.count += 1;
  }
  values(): SeedValue[] {
    return [...this.m.entries()]
      .map(([value, e]) => ({ value, shiurim: e.shiurim.size, count: e.count }))
      .sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function arr(x: unknown): unknown[] {
  return Array.isArray(x) ? x : [];
}

function write(name: string, source: string, note: string, t: Tally): void {
  const file: SeedFile = { source, note, values: t.values() };
  writeFileSync(join(outDir, name), JSON.stringify(file, null, 1) + "\n");
  console.log(`seed/${name}: ${file.values.length} distinct values`);
}

function main(): void {
  mkdirSync(outDir, { recursive: true });

  // ---- ingest: parsha + zman ----
  const ingestPath = join(dataDir, "derived", "ingest.json");
  const ingest: unknown = JSON.parse(readFileSync(ingestPath, "utf8"));
  const parsha = new Tally();
  const zman = new Tally();
  if (!isRecord(ingest)) throw new Error("ingest.json: not an object");
  for (const s of arr(ingest["shiurim"])) {
    if (!isRecord(s) || typeof s["id"] !== "string") continue;
    parsha.add(s["parsha"], s["id"]);
    zman.add(s["zman"], s["id"]);
  }
  write("parsha.json", "data/derived/ingest.json shiurim[].parsha", "catalog spellings", parsha);
  write("zman.json", "data/derived/ingest.json shiurim[].zman", "catalog spellings", zman);

  // ---- extraction: works, refs, people, concepts ----
  const works = new Tally();
  const refs = new Tally();
  const people = new Tally();
  const concepts = new Tally();
  const shiurimDir = join(dataDir, "derived", "shiurim");
  const ids = existsSync(shiurimDir) ? readdirSync(shiurimDir).sort() : [];
  let read = 0;
  for (const id of ids) {
    const p = join(shiurimDir, id, "extraction.json");
    if (!existsSync(p)) continue;
    let ex: unknown;
    try {
      ex = JSON.parse(readFileSync(p, "utf8"));
    } catch {
      continue; // a broken file is the corpus loader's problem, not the seed's
    }
    if (!isRecord(ex)) continue;
    read += 1;
    for (const src of arr(ex["sources"])) {
      if (!isRecord(src)) continue;
      works.add(src["work"], id);
      refs.add(src["sefariaRef"], id);
    }
    for (const person of arr(ex["people"])) {
      if (isRecord(person)) people.add(person["name"], id);
    }
    for (const story of arr(ex["stories"])) {
      if (!isRecord(story)) continue;
      for (const name of arr(story["people"])) people.add(name, id);
    }
    for (const c of arr(ex["concepts"])) {
      if (isRecord(c)) concepts.add(c["he"], id);
    }
  }
  console.log(`read ${read} extraction files`);
  write("works.json", "extraction.json sources[].work", "model-normalised work names", works);
  write("sefaria-refs.json", "extraction.json sources[].sefariaRef", "Sefaria-style refs", refs);
  write("people.json", "extraction.json people[].name + stories[].people[]", "English names", people);
  write("concepts.json", "extraction.json concepts[].he", "Hebrew terms", concepts);
}

main();
