import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IngestOutput } from "../../../../src/types.ts";
import { DEFAULT_INGEST, run } from "../../src/publish/cli.ts";
import { buildPublishPlan } from "../../src/publish/plan.ts";
import { buildAudioTable } from "../../src/table.ts";

/**
 * Acceptance (integration-plan §8 W1.5): a dry run on the real ingest lists exactly
 * the in-scope recordings with duplicateOf null, prints the count computed from
 * ingest, and contains no transcripts/ key.
 */
describe.runIf(existsSync(DEFAULT_INGEST))("dry run on the real ingest.json", () => {
  const ingest = JSON.parse(readFileSync(DEFAULT_INGEST, "utf8")) as IngestOutput;

  // Expected set, computed independently of the planner.
  const inScopeIds = new Set(ingest.shiurim.filter((s) => s.inScope).flatMap((s) => s.recordingIds));
  const expected = ingest.recordings
    .filter((r) => inScopeIds.has(r.id) && r.duplicateOf === null)
    .map((r) => r.id)
    .sort();

  it("plans exactly the in-scope recordings with duplicateOf null", () => {
    const plan = buildPublishPlan(ingest);
    const listed = [...plan.items.map((i) => i.id), ...plan.refused.map((r) => r.id)].sort();
    // Canonicals pulled in only via in-scope duplicates would be extra; the real data has none.
    expect(plan.counts.canonicalViaDuplicate).toBe(0);
    expect(listed).toEqual(expected);
    expect(plan.counts.inScopeCanonical).toBe(expected.length);
    for (const it of plan.items) {
      expect(it.sourceKey.toLowerCase().startsWith("transcripts/")).toBe(false);
      expect(it.sourceKey.toLowerCase().endsWith(".mp3")).toBe(true);
      expect(it.destKey).toBe(`${it.id}.mp3`);
    }
    // Only non-mp3 sources may be refused in the real data.
    for (const r of plan.refused) expect(r.reason).toBe("not-mp3");
    console.log(
      `[audio] real ingest: ${expected.length} in-scope recordings with duplicateOf null → ` +
        `${plan.counts.toCopy} to copy, ${plan.counts.refused} refused (${plan.refused.map((r) => r.id).join(", ")})`,
    );
  });

  it("CLI --dry-run prints every planned id, the count, and no transcripts/ key", async () => {
    const out: string[] = [];
    const code = await run(["--dry-run"], { out: (s) => out.push(s), err: (s) => out.push(s), env: {} });
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).not.toMatch(/(^|\s)transcripts\//m);
    const lines = text.split("\n");
    const ids = lines
      .filter((l) => l.startsWith("copy ") || l.startsWith("REFUSE "))
      .map((l) => l.split(/\s+/)[1])
      .sort();
    expect(ids).toEqual(expected);
    expect(text).toContain(`with duplicateOf null:              ${expected.length}`);
  });

  it("the audio table built from the same recordings covers every publishable one", () => {
    const recs = ingest.recordings.filter((r) => inScopeIds.has(r.id));
    const table = buildAudioTable(recs);
    const plan = buildPublishPlan(ingest);
    for (const it of plan.items) expect(table[it.id]?.canonicalId).toBe(it.id);
    for (const r of plan.refused) expect(table[r.id]).toBeUndefined();
    // No table entry ever points at an object that is not published.
    const published = new Set(plan.items.map((i) => i.id));
    for (const entry of Object.values(table)) expect(published.has(entry.canonicalId)).toBe(true);
  });
});
