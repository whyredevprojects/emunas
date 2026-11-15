/**
 * Status gate (C4): a shiur is "full" only when
 *   manifest status is `done`
 *   AND meta/extraction/writeup exist, parse and validate
 *   AND writeup.extractionVariant === "extraction"
 *   AND the structural checks below pass.
 * Anything else is "catalog-only" plus a report entry. Never throws.
 */
import type { Extraction, Shiur, Writeup } from "../../../../src/types.ts";
import type { ManifestEntry, Meta } from "./schemas.ts";
import type { ShiurFiles } from "./load.ts";

export type GateResult =
  | { full: true; meta: Meta; extraction: Extraction; writeup: Writeup }
  | { full: false; reasons: string[]; /** true when the manifest said done (a downgrade) */ downgrade: boolean };

export function gate(shiur: Shiur, entry: ManifestEntry | undefined, files: ShiurFiles | null): GateResult {
  if (!entry) return { full: false, reasons: ["not in manifest"], downgrade: false };
  if (entry.status !== "done") return { full: false, reasons: [`manifest status ${entry.status}`], downgrade: false };
  if (!files) return { full: false, reasons: ["files not read"], downgrade: true };
  const { meta, extraction, writeup } = files;
  if (files.problems.length > 0 || !meta || !extraction || !writeup) {
    return { full: false, reasons: files.problems.length ? files.problems : ["files missing"], downgrade: true };
  }
  const reasons = structuralProblems(shiur, meta, extraction, writeup);
  if (reasons.length > 0) return { full: false, reasons, downgrade: true };
  return { full: true, meta, extraction, writeup };
}

const MAX_REASONS = 8;

export function structuralProblems(shiur: Shiur, meta: Meta, ex: Extraction, wu: Writeup): string[] {
  const out: string[] = [];
  const err = (s: string) => {
    if (out.length < MAX_REASONS) out.push(s);
  };

  if (wu.extractionVariant !== "extraction") err(`writeup.extractionVariant is ${JSON.stringify(wu.extractionVariant)}, not "extraction"`);
  if (meta.shiurId !== shiur.id) err("meta.shiurId does not match");
  if (ex.shiurId !== shiur.id) err("extraction.shiurId does not match");
  if (wu.shiurId !== shiur.id) err("writeup.shiurId does not match");

  // Recordings: meta must describe exactly the shiur's recordings, in playback order.
  const metaIds = [...meta.recordings].sort((a, b) => a.order - b.order).map((r) => r.recording.id);
  if (metaIds.join("\n") !== shiur.recordingIds.join("\n")) err("meta recordings differ from the shiur's recordings");
  const segCount = new Map<string, number>();
  for (const r of meta.recordings) {
    if (r.starts.length !== r.segmentCount || r.ends.length !== r.segmentCount) {
      err(`recording ${r.recording.id}: starts/ends length differs from segmentCount`);
    }
    segCount.set(r.recording.id, Math.min(r.segmentCount, r.starts.length, r.ends.length));
  }

  // Sections: valid ranges, recordings of this shiur, tiling every recording with no gap or overlap.
  const byRec = new Map<string, { start: number; end: number }[]>();
  ex.sections.forEach((s, i) => {
    const n = segCount.get(s.recordingId);
    if (n === undefined) return err(`sections[${i}]: recording is not part of the shiur`);
    if (!(s.startSeg >= 0 && s.startSeg <= s.endSeg && s.endSeg < n)) return err(`sections[${i}]: seg range outside 0..${n - 1}`);
    let list = byRec.get(s.recordingId);
    if (!list) byRec.set(s.recordingId, (list = []));
    list.push({ start: s.startSeg, end: s.endSeg });
    s.subsections.forEach((sub, j) => {
      if (sub.recordingId !== s.recordingId || sub.startSeg < s.startSeg || sub.endSeg > s.endSeg || sub.startSeg > sub.endSeg) {
        err(`sections[${i}].subsections[${j}]: range outside its section`);
      }
    });
  });
  for (const [recId, n] of segCount) {
    const list = (byRec.get(recId) ?? []).sort((a, b) => a.start - b.start);
    if (n === 0) continue;
    if (list.length === 0) {
      err(`recording ${recId}: no sections`);
      continue;
    }
    let expect = 0;
    let tiled = true;
    for (const r of list) {
      if (r.start !== expect) {
        err(`recording ${recId}: sections do not tile (gap or overlap at seg ${expect})`);
        tiled = false;
        break;
      }
      expect = r.end + 1;
    }
    if (tiled && expect !== n) err(`recording ${recId}: sections end at seg ${expect - 1}, last seg is ${n - 1}`);
  }

  // Evidence recording ids must belong to the shiur.
  const own = new Set(shiur.recordingIds);
  const recIds: (string | undefined)[] = [
    ...ex.summary.keyPoints.map((k) => k.evidence.recordingId),
    ...ex.sources.map((s) => s.evidence.recordingId),
    ...ex.insights.map((k) => k.evidence.recordingId),
    ...ex.takeaways.map((k) => k.evidence.recordingId),
    ...ex.stories.map((k) => k.evidence.recordingId),
    ...ex.questions.map((q) => q.recordingId),
    ...wu.en.flatMap((b) => b.paragraphs.map((p) => p.evidence.recordingId)),
    ...wu.yi.flatMap((b) => b.paragraphs.map((p) => p.evidence.recordingId)),
  ];
  if (recIds.some((id) => id !== undefined && !own.has(id))) err("an evidence recordingId is not part of the shiur");

  // Write-up indexes into the extraction.
  for (const ed of ["en", "yi"] as const) {
    wu[ed].forEach((b, i) => {
      if (b.sectionIndex >= ex.sections.length) err(`writeup.${ed}[${i}].sectionIndex out of range`);
      b.paragraphs.forEach((p, j) => {
        if (p.sourceIdx.some((k) => k < 0 || k >= ex.sources.length)) err(`writeup.${ed}[${i}].paragraphs[${j}].sourceIdx out of range`);
      });
    });
  }
  return out;
}
