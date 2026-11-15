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
import { readCorpusInput, type CorpusInput } from "./corpus-input.ts";
import { glossaryShardFor } from "../app/data/paths.ts";
import type { BuildFile } from "../app/data/types.ts";
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

/**
 * The files a newly full shiur may touch: its own, every aggregate list, its entities' pages (corpus
 * ids, C1.7), and the corpus-layer files whose visible recounts it changes: its topics (and their
 * ancestors), the threads and stories it joins (their pages, the topics that list them and the other
 * member shiurim's refs), its concepts' glossary shards.
 */
function expectedFiles(s: PublicShiur, occasionKeys: string[], input: CorpusInput, build: BuildFile): Set<string> {
  const layer = input.layer!;
  const refs = layer.refs.get(s.id)!;
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
    "topics.json",
    "stories-index.json",
    "redirects.json",
    "explore/entities.json",
  ]);
  if (s.series) set.add(`series/${s.series.id}.json`);
  for (const k of refs.workIds) set.add(`work/${k}.json`);
  const storyIds = new Set(refs.stories.map((x) => x.storyId));
  const threadIds = new Set(refs.insights.map((x) => x.threadId));
  const people = [...refs.personIds, ...(layer.stories ?? []).filter((st) => storyIds.has(st.id)).flatMap((st) => st.people.flatMap((p) => ("id" in p ? [p.id] : [])))];
  for (const k of people) set.add(`entity/p/${k}.json`);
  for (const k of refs.conceptIds) {
    set.add(`entity/c/${k}.json`);
    const shard = glossaryShardFor(k, build.glossaryShards);
    if (shard) set.add(`glossary/${shard}.json`);
  }
  for (const k of occasionKeys) set.add(`entity/o/${k}.json`);
  const parent = new Map(layer.topics.map((t) => [t.id, t.parentId]));
  const topics = new Set<string>();
  for (const id of [...refs.topics.map((t) => t.id), ...refs.chapters.flatMap((c) => c.topicIds)]) {
    for (let cur: string | null | undefined = id; cur && !topics.has(cur); cur = parent.get(cur)) topics.add(cur);
  }
  for (const d of layer.topicDetail.values()) {
    if (d.threadIds.some((x) => threadIds.has(x)) || d.storyIds.some((x) => storyIds.has(x))) topics.add(d.id);
  }
  for (const t of topics) set.add(`topic/${t}.json`);
  for (const id of storyIds) set.add(`story/${id}.json`);
  for (const id of threadIds) set.add(`thread/${id}.json`);
  for (const st of (layer.stories ?? []).filter((x) => storyIds.has(x.id))) for (const t of st.tellings) set.add(`shiur/${t.shiurId}.json`);
  for (const th of (layer.threads ?? []).filter((x) => threadIds.has(x.id))) for (const m of th.members) set.add(`shiur/${m.shiurId}.json`);
  // A concept or work the new shiur cites can cross its page threshold, which flips the page flag
  // on the chips of every shiur that cites it.
  const concepts = new Set(refs.conceptIds);
  const works = new Set(refs.workIds);
  for (const [id, r] of layer.refs) {
    if (r.conceptIds.some((k) => concepts.has(k)) || r.workIds.some((k) => works.has(k))) set.add(`shiur/${id}.json`);
  }
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
    const expected = expectedFiles(s, occasionKeys, after.input, after.files.get("build.json") as BuildFile);
    // Moment shards after the new shiur's position may shift, and topic moment pages after its
    // sections; they are expected to change.
    const changed = r.written.filter((f) => !f.startsWith("moments/") && !/^topic\/.+\.moments-\d+\.json$/.test(f));
    for (const f of changed) expect(expected.has(f), `unexpected change: ${f}`).toBe(true);
    expect(r.removed.filter((f) => !/^topic\/.+\.moments-\d+\.json$/.test(f))).toEqual([]);

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
    const untouched = [...before.files.keys()].filter((f) => !r.written.includes(f) && !r.removed.includes(f));
    expect(untouched.length).toBeGreaterThan(r.written.length);
    for (const f of untouched) expect(statSync(join(out, f)).mtimeMs, f).toBe(mtimes.get(f));
    // Other shiurim's files are untouched, except the refs of shiurim sharing a story or thread with it.
    for (const f of untouched.filter((x) => x.startsWith("shiur/"))) expect(f).not.toBe(`shiur/${NEW_ID}.json`);
    expect(r.written.filter((f) => f.startsWith("shiur/"))).toContain(`shiur/${NEW_ID}.json`);
    for (const f of r.written.filter((x) => x.startsWith("shiur/"))) expect(expected.has(f), f).toBe(true);
  });
});
