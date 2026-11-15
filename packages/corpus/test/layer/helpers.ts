/**
 * Checks shared by the mini and real-data layer tests.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fold } from "@emunas/normalize";
import type {
  LayerConceptsFile,
  LayerPeopleFile,
  LayerStoriesFile,
  LayerSynonymsFile,
  LayerThreadsFile,
  LayerTopicsFile,
  LayerWorksFile,
} from "../../src/public/corpus-layer.ts";
import { allKeys } from "../helpers.ts";

/** Keys no layer file may carry (plan §1, §3.4; acceptance 6). */
export const LAYER_FORBIDDEN_KEY = /^(?:asrVariants|heardAs.*|startSeg|endSeg|sampleTitles|resolutionTotals|nullWork|fromStories|fromPeople|segs|segments|transcriptKey|audioKey)$/;

export function forbiddenKeys(files: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [name, content] of Object.entries(files)) for (const k of allKeys(content)) if (LAYER_FORBIDDEN_KEY.test(k)) out.push(`${name}: ${k}`);
  return out;
}

type Json = Record<string, unknown>;
const strs = (...xs: unknown[]): string[] =>
  xs.flatMap((x) => (typeof x === "string" ? [x] : Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []));

/**
 * The display-field set of every entity, read straight from `data/derived/corpus/*.json` (never from
 * `.corpus`, never from raw/ or an alias map): kind → id → folded terms.
 */
export function displayFieldSets(dataDir: string): Map<string, Map<string, Set<string>>> {
  const dir = join(dataDir, "derived/corpus");
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Json[];
  const out = new Map<string, Map<string, Set<string>>>();
  const add = (kind: string, recs: Json[], fields: (r: Json) => string[]) => {
    const m = new Map<string, Set<string>>();
    for (const r of recs) m.set(String(r["id"]), new Set(fields(r).map((s) => fold(s))));
    out.set(kind, m);
  };
  add("topic", read("topics.json"), (r) => {
    const l = r["label"] as Json;
    return strs(l["en"], l["yi"], l["he"], r["aliases"]);
  });
  add("concept", read("concepts.json"), (r) => {
    const l = r["label"] as Json;
    return strs(r["canonicalHe"], l["en"], l["yi"], r["transliterations"]);
  });
  add("person", read("people.json"), (r) => strs(r["nameHe"], r["nameEn"], r["nameYi"], r["aliases"]));
  add("work", read("works.json"), (r) => strs(r["titleHe"], r["titleEn"], r["sefariaIndexTitle"], r["aliases"]));
  return out;
}

/**
 * Every published alias or synonym that is not in its entity's display-field set (acceptance 5).
 * Covers synonyms.json and the alias-bearing fields of the entity files.
 */
export function aliasViolations(files: Record<string, unknown>, dataDir: string): string[] {
  const sets = displayFieldSets(dataDir);
  const v: string[] = [];
  const check = (kind: string, id: string, terms: readonly string[], where: string) => {
    const set = sets.get(kind)?.get(id);
    for (const t of terms) if (!set || !set.has(fold(t))) v.push(`${where} ${kind}:${id} "${t}"`);
  };
  for (const s of (files["synonyms.json"] as LayerSynonymsFile).synonyms) check(s.kind, s.id, s.terms, "synonyms.json");
  for (const p of (files["people.json"] as LayerPeopleFile).people) check("person", p.id, [p.nameHe, p.nameEn, p.nameYi, ...p.aliases], "people.json");
  for (const w of (files["works.json"] as LayerWorksFile).works) {
    check("work", w.id, [w.titleHe, w.titleEn, ...w.aliases, ...(w.sefariaIndexTitle ? [w.sefariaIndexTitle] : [])], "works.json");
  }
  for (const c of (files["concepts.json"] as LayerConceptsFile).concepts) {
    check("concept", c.id, [c.canonicalHe, c.label.en, c.label.yi, ...c.transliterations], "concepts.json");
  }
  for (const t of (files["topics.json"] as LayerTopicsFile).tree) {
    check("topic", t.id, [t.label.en, t.label.yi, ...(t.label.he !== undefined ? [t.label.he] : [])], "topics.json");
  }
  return v;
}

/** Every shiur id a layer file references, with where (acceptance 1, 2). */
export function referencedShiurIds(files: Record<string, unknown>): { where: string; shiurId: string }[] {
  const out: { where: string; shiurId: string }[] = [];
  const add = (where: string, ids: Iterable<string>) => {
    for (const shiurId of ids) out.push({ where, shiurId });
  };
  const topics = files["topics.json"] as LayerTopicsFile;
  for (const d of topics.detail) {
    add(`topic ${d.id} hubs`, d.hubs);
    add(`topic ${d.id} grades`, [...d.grades.main, ...d.grades.discussed, ...d.grades.touched].map((r) => r.shiurId));
  }
  for (const c of (files["concepts.json"] as LayerConceptsFile).concepts) {
    add(`concept ${c.id}`, c.shiurIds);
    add(`concept ${c.id} exampleRefs`, c.exampleRefs.map((r) => r.shiurId));
  }
  for (const p of (files["people.json"] as LayerPeopleFile).people) add(`person ${p.id}`, p.shiurIds);
  for (const w of (files["works.json"] as LayerWorksFile).works) add(`work ${w.id}`, w.shiurIds);
  for (const s of (files["stories.json"] as LayerStoriesFile).stories) add(`story ${s.id}`, s.tellings.map((t) => t.shiurId));
  for (const t of (files["threads.json"] as LayerThreadsFile).threads) add(`thread ${t.id}`, t.members.map((m) => m.shiurId));
  for (const [name, content] of Object.entries(files)) {
    if (name.startsWith("series/")) {
      const s = content as { arc: { shiurId: string }[] };
      add(name, s.arc.map((a) => a.shiurId));
    }
    if (name.startsWith("shiur/")) {
      const r = content as { shiurId: string; insights: { other?: { shiurId: string } }[] };
      add(name, [r.shiurId, ...r.insights.flatMap((i) => (i.other ? [i.other.shiurId] : []))]);
    }
  }
  return out;
}

/** Recount checks (acceptance 1): no count exceeds the visible recount of its own list. */
export function countViolations(files: Record<string, unknown>, visible: ReadonlySet<string>): string[] {
  const v: string[] = [];
  const topics = files["topics.json"] as LayerTopicsFile;
  topics.tree.forEach((t, i) => {
    const d = topics.detail[i]!;
    const ids = new Set([...d.grades.main, ...d.grades.discussed, ...d.grades.touched].map((r) => r.shiurId));
    if (t.count !== ids.size) v.push(`topic ${t.id}: count ${t.count} != graded ${ids.size}`);
    if (t.count > visible.size) v.push(`topic ${t.id}: count above |V|`);
  });
  const lists: [string, { id: string; count: number; shiurIds: string[] }[]][] = [
    ["concept", (files["concepts.json"] as LayerConceptsFile).concepts],
    ["person", (files["people.json"] as LayerPeopleFile).people],
    ["work", (files["works.json"] as LayerWorksFile).works],
  ];
  for (const [kind, list] of lists) {
    for (const e of list) {
      const n = new Set(e.shiurIds.filter((id) => visible.has(id))).size;
      if (e.count !== n) v.push(`${kind} ${e.id}: count ${e.count} != visible recount ${n}`);
    }
  }
  for (const t of (files["threads.json"] as LayerThreadsFile).threads) {
    const n = new Set(t.members.map((m) => m.shiurId)).size;
    if (t.shiurCount !== n) v.push(`thread ${t.id}: shiurCount ${t.shiurCount} != ${n}`);
  }
  for (const s of (files["stories.json"] as LayerStoriesFile).stories) {
    const n = new Set(s.tellings.map((m) => m.shiurId)).size;
    if (s.shiurCount !== n) v.push(`story ${s.id}: shiurCount ${s.shiurCount} != ${n}`);
  }
  return v;
}
