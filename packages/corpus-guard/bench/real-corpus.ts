/**
 * Real-data stand-in for `.corpus/` until `corpus:build` (W1.2) lands: a minimal
 * PublicShiur-shaped object per `done` shiur, carrying only the derived *text* fields that
 * will ship (summary, key points, chapters, insights, takeaways, questions, stories,
 * write-up), never heardAs/asrNotes/segs. Used by the bench and the real-data test to
 * time the pre-pass on today's corpus. Nothing here is written to disk.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectShiurItems, type ShiurUnits } from "../src/items.ts";
import { layerFileUnits, type CorpusUnit } from "../src/layer.ts";

export const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export const DERIVED_DIR = join(REPO_ROOT, "data", "derived");

type L = { en?: string; yi?: string };
type J = Record<string, unknown>;

function arr(v: unknown): J[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "object" && x !== null) as J[]) : [];
}

function loc(v: unknown): L {
  const o = (typeof v === "object" && v !== null ? v : {}) as J;
  const out: L = {};
  if (typeof o.en === "string") out.en = o.en;
  if (typeof o.yi === "string") out.yi = o.yi;
  return out;
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

/** Pseudo PublicShiur for one shiur (text fields only), or null when files are missing/invalid. */
export function pseudoShiur(shiurId: string, recordingIds: string[]): unknown {
  const dir = join(DERIVED_DIR, "shiurim", shiurId);
  const ef = join(dir, "extraction.json");
  const wf = join(dir, "writeup.json");
  if (!existsSync(ef) || !existsSync(wf)) return null;
  let e: J;
  let w: J;
  try {
    e = readJson(ef) as J;
    w = readJson(wf) as J;
  } catch {
    return null;
  }
  const summary = (e.summary ?? {}) as J;
  const moments = (list: unknown, kind: string) =>
    arr(list).map((x, i) => ({ id: `${shiurId}~${kind}${i}`, text: loc(x.text) }));
  const writeup: Record<string, unknown> = {};
  for (const ed of ["en", "yi"]) {
    writeup[ed] = arr(w[ed]).map((b) => ({
      sectionIndex: b.sectionIndex,
      heading: typeof b.heading === "string" ? b.heading : null,
      paragraphs: arr(b.paragraphs).map((p) => ({ text: typeof p.text === "string" ? p.text : "" })),
    }));
  }
  return {
    id: shiurId,
    recordings: recordingIds.map((id) => ({ id })),
    notes: {
      summary: { oneLiner: loc(summary.oneLiner), abstract: loc(summary.abstract), keyPoints: moments(summary.keyPoints, "kp") },
      chapters: arr(e.sections).map((s, idx) => ({
        idx,
        title: loc(s.title),
        summary: loc(s.summary),
        sub: arr(s.subsections).map((u) => ({ title: loc(u.title), summary: loc(u.summary) })),
      })),
      insights: moments(e.insights, "i"),
      takeaways: moments(e.takeaways, "tk"),
      questions: arr(e.questions).map((q, i) => ({ id: `${shiurId}~q${i}`, q: loc(q.question), a: loc(q.answer) })),
      stories: arr(e.stories).map((s, i) => ({ id: `${shiurId}~st${i}`, title: loc(s.title), retelling: loc(s.retelling) })),
      writeup,
    },
  };
}

/** Units for every manifest `done` shiur, recordings from ingest.json. */
export function* realUnits(): Generator<ShiurUnits | null> {
  const manifest = readJson(join(DERIVED_DIR, "manifest.json")) as { entries: { shiurId: string; status: string }[] };
  const ingest = readJson(join(DERIVED_DIR, "ingest.json")) as { shiurim: { id: string; recordingIds: string[] }[] };
  const recs = new Map(ingest.shiurim.map((s) => [s.id, s.recordingIds]));
  for (const entry of manifest.entries) {
    if (entry.status !== "done") continue;
    const shiur = pseudoShiur(entry.shiurId, recs.get(entry.shiurId) ?? []);
    yield shiur === null ? null : collectShiurItems(shiur);
  }
}

export function hasRealData(): boolean {
  return existsSync(join(DERIVED_DIR, "manifest.json")) && existsSync(join(DERIVED_DIR, "ingest.json"));
}

/**
 * Real-data stand-in for the corpus-layer text units (`.corpus/layer/`, C1.2): the generated corpus
 * prose of `data/derived/corpus/` (stories, teaching clusters, topic descriptions, concepts, series
 * syntheses) in the layer's shape, with every listed member (not only the visible ones, so the
 * stand-in is a superset of what the layer ships). Reads only the public entity files, never raw/.
 */
export function realLayerUnits(): CorpusUnit[] {
  const dir = join(DERIVED_DIR, "corpus");
  if (!existsSync(join(dir, "index.json"))) return [];
  const read = (f: string): J[] => (existsSync(join(dir, f)) ? arr(readJson(join(dir, f))) : []);
  const ids = (v: unknown, key = "shiurId") => arr(v).map((x) => ({ shiurId: x[key] }));
  const units: CorpusUnit[] = [];
  units.push(...layerFileUnits("stories.json", { stories: read("stories.json").map((s) => ({ ...pick(s, "id", "title", "retelling"), tellings: ids(s.tellings) })) }));
  units.push(...layerFileUnits("threads.json", { threads: read("teaching-clusters.json").map((c) => ({ ...pick(c, "id", "label", "summary"), members: ids(c.members) })) }));
  units.push(
    ...layerFileUnits("topics.json", {
      detail: read("topics.json").map((t) => ({ id: t.id, description: t.description, hubs: t.hubShiurIds, grades: { main: [], discussed: [], touched: [] } })),
    }),
  );
  units.push(...layerFileUnits("concepts.json", { concepts: read("concepts.json").map((c) => pick(c, "id", "label", "definition", "shiurIds", "exampleRefs")) }));
  const seriesDir = join(dir, "series");
  if (existsSync(seriesDir)) {
    for (const f of readdirSync(seriesDir).sort()) {
      if (!f.endsWith(".json")) continue;
      const s = readJson(join(seriesDir, f)) as J;
      units.push(...layerFileUnits(`series/${f}`, pick(s, "seriesId", "title", "overview", "keyThemes", "arc")));
    }
  }
  return units;
}

function pick(r: J, ...keys: string[]): J {
  const out: J = {};
  for (const k of keys) out[k] = r[k];
  return out;
}
