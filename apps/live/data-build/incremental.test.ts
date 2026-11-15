/**
 * Acceptance: adding one new done shiur changes only the expected files. The mini corpus is built
 * with one shiur held back as "pending" (its files are already on disk, as when the pipeline is
 * mid-flight), emitted and written; then the manifest flips it to "done", and the whole chain
 * (corpus:build → emit → write) runs again over the same output directories.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PublicShiur } from "@emunas/corpus/public";
import { readCorpusInput } from "./corpus-input.ts";
import { emitLiveData } from "./emit.ts";
import { GENERATED_AT, MINI_POLICY, buildCorpusTo, editJson, miniCopy, tmp } from "./test-helpers.ts";
import { writeDataDir } from "./write.ts";

type Manifest = { entries: { shiurId: string; status: string; updatedAt?: string }[] };

const NEW_ID = "yi-shonos-31";

function setStatus(dataDir: string, status: string, updatedAt?: string): void {
  editJson<Manifest>(join(dataDir, "derived/manifest.json"), (m) => {
    const e = m.entries.find((x) => x.shiurId === NEW_ID)!;
    e.status = status;
    if (updatedAt !== undefined) e.updatedAt = updatedAt;
  });
}

/** The files a newly full shiur may touch: its own, every aggregate list, and its entities' pages. */
function expectedFiles(s: PublicShiur, occasionKeys: string[]): Set<string> {
  const n = s.notes!;
  const set = new Set<string>([
    "build.json",
    "corpus.json",
    "facets.json",
    "today.json",
    "stories.json",
    "works.json",
    "quick-index.en.json",
    "quick-index.yi.json",
    `shiur/${s.id}.json`,
    `writeup/${s.id}.en.json`,
    `writeup/${s.id}.yi.json`,
  ]);
  if (s.series) set.add(`series/${s.series.id}.json`);
  for (const k of n.sources.flatMap((x) => (x.workKey ? [x.workKey] : []))) set.add(`work/${k}.json`);
  for (const k of [...n.people.map((p) => p.key), ...n.stories.flatMap((x) => x.peopleKeys)])
    set.add(`entity/p/${k}.json`);
  for (const k of n.concepts.map((c) => c.key)) set.add(`entity/c/${k}.json`);
  for (const k of occasionKeys) set.add(`entity/o/${k}.json`);
  return set;
}

describe("a new done shiur", () => {
  it("changes only the expected files and leaves every other file untouched", () => {
    const data = miniCopy();
    const corpusDir = join(tmp(), ".corpus");
    const out = join(tmp(), "data");
    const run = () => {
      buildCorpusTo(data, MINI_POLICY, { outDir: corpusDir });
      const input = readCorpusInput(corpusDir);
      return { input, files: emitLiveData(input, { generatedAt: GENERATED_AT }) };
    };

    setStatus(data, "pending");
    const before = run();
    expect(before.input.shiurim.find((s) => s.id === NEW_ID)?.status).toBe("catalog-only");
    writeDataDir(out, before.files);
    const mtimes = new Map([...before.files.keys()].map((f) => [f, statSync(join(out, f)).mtimeMs]));

    // Re-running with no data change rewrites nothing.
    const same = writeDataDir(out, run().files);
    expect(same.written).toEqual([]);
    expect(same.removed).toEqual([]);

    setStatus(data, "done", "2026-11-16T00:00:00.000Z");
    const after = run();
    const s = after.input.shiurim.find((x) => x.id === NEW_ID)!;
    expect(s.status).toBe("full");
    const r = writeDataDir(out, after.files);

    const occasionKeys = [s.parsha?.key, s.zman?.key].flatMap((k) => (k ? [k] : []));
    const expected = expectedFiles(s, occasionKeys);
    // Moment shards after the new shiur's position may shift; they are expected to change.
    const changed = r.written.filter((f) => !f.startsWith("moments/"));
    for (const f of changed) expect(expected.has(f), `unexpected change: ${f}`).toBe(true);
    expect(r.removed).toEqual([]);

    // The must-change files did change.
    for (const f of [
      `shiur/${NEW_ID}.json`,
      `writeup/${NEW_ID}.en.json`,
      `writeup/${NEW_ID}.yi.json`,
      "corpus.json",
      "build.json",
      "today.json",
    ]) {
      expect(r.written, f).toContain(f);
    }
    expect(r.written.some((f) => f.startsWith("moments/"))).toBe(true);
    // ... and the only new moment rows are the new shiur's.
    const rows = (files: Map<string, unknown>) =>
      [...files]
        .filter(([f]) => f.startsWith("moments/"))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .flatMap(([f, body]) =>
          (body as { moments: { shiurId: string }[] }).moments.map((m) => `${f.split("-")[0]}|${JSON.stringify(m)}`),
        );
    const afterRows = rows(after.files);
    expect(afterRows.filter((x) => !x.includes(`"shiurId":"${NEW_ID}"`))).toEqual(rows(before.files));
    expect(afterRows.length).toBeGreaterThan(rows(before.files).length);
    const today = after.files.get("today.json") as { newlySummarized: { shiurId: string }[] };
    expect(today.newlySummarized[0]?.shiurId).toBe(NEW_ID);

    // Everything else kept its bytes and its mtime.
    const untouched = [...before.files.keys()].filter((f) => !r.written.includes(f));
    expect(untouched.length).toBeGreaterThan(r.written.length);
    for (const f of untouched) expect(statSync(join(out, f)).mtimeMs, f).toBe(mtimes.get(f));
    // Other shiurim's files are untouched.
    for (const f of untouched.filter((x) => x.startsWith("shiur/"))) expect(f).not.toBe(`shiur/${NEW_ID}.json`);
    expect(r.written.filter((f) => f.startsWith("shiur/"))).toEqual([`shiur/${NEW_ID}.json`]);
  });
});
