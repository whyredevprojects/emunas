/**
 * Legacy redirects (corpus-wave-plan §5): the old normalize-keyed people, works and concepts that
 * the aggregate still computes, mapped to the merged corpus entities. In order: the old entity's
 * spellings folded against the new entity's display names (a unique best match), then the same
 * slug, then for people ≥80% shiur overlap both ways, and for works the corpus work most of its
 * mentions resolve to. The match then follows the corpus redirects (already applied: the layer
 * files hold live ids only). A concept merged into a topic goes to the topic. No match, or a match
 * on an excluded person → null (the site sends it to the index page). Alias maps are not used.
 */
import { fold } from "@emunas/normalize";
import type { Aggregates } from "../aggregate/types.ts";
import type {
  LayerConceptsFile,
  LayerPeopleFile,
  LayerTopicsFile,
  LayerWorksFile,
  LegacyKind,
  LegacyRedirect,
} from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";

/** Minimum shiur overlap (both ways) for a person matched by shiurim. */
export const LEGACY_PERSON_OVERLAP = 0.8;

const matchForm = (s: string): string => fold(s).replace(/^the /, "");
const TITLE = /^(?:rabbi|rebbe|reb|rav|r) /;

/** Matching forms of one name: as written, without and inside a parenthesis, and without a title. */
export function nameForms(raw: string): string[] {
  const parts = [raw, raw.replace(/\s*\([^()]*\)/g, " "), ...[...raw.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]!)];
  const out = new Set<string>();
  for (const p of parts) {
    const f = matchForm(p);
    if (f.length === 0) continue;
    out.add(f);
    const bare = f.replace(TITLE, "");
    if (bare.length > 0) out.add(bare);
  }
  return [...out];
}

class NameIndex {
  private readonly m = new Map<string, Set<string>>();
  add(id: string, names: readonly (string | null | undefined)[]): void {
    for (const n of names) {
      if (typeof n !== "string") continue;
      for (const f of nameForms(n)) {
        let s = this.m.get(f);
        if (!s) this.m.set(f, (s = new Set()));
        s.add(id);
      }
    }
  }
  /** The id hit by the most names, when it is the unique best. */
  best(names: readonly (string | null | undefined)[]): string | null {
    const hits = new Map<string, number>();
    const seen = new Set<string>();
    for (const n of names) {
      if (typeof n !== "string") continue;
      // One vote per distinct name for every entity any of its forms hits.
      const key = matchForm(n);
      if (key.length === 0 || seen.has(key)) continue;
      seen.add(key);
      const ids = new Set<string>();
      for (const f of nameForms(n)) for (const id of this.m.get(f) ?? []) ids.add(id);
      for (const id of ids) hits.set(id, (hits.get(id) ?? 0) + 1);
    }
    const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]));
    if (ranked.length === 0) return null;
    if (ranked.length > 1 && ranked[1]![1] === ranked[0]![1]) return null;
    return ranked[0]![0];
  }
}

export interface LegacyInput {
  aggregates: Aggregates;
  topics: LayerTopicsFile;
  concepts: LayerConceptsFile;
  people: LayerPeopleFile;
  works: LayerWorksFile;
}

export function buildLegacyRedirects(ctx: LayerContext, x: LegacyInput): LegacyRedirect[] {
  const out: LegacyRedirect[] = [];
  const ent = x.aggregates.entities;
  const flags = (list: { key: string; quietPage: boolean; livePrerender: boolean }[]) =>
    new Map(list.map((e) => [e.key, { quiet: e.quietPage, live: e.livePrerender }]));

  // ---- people
  const people = new Map(x.people.people.map((p) => [p.id, p]));
  const personNames = new NameIndex();
  for (const p of x.people.people) personNames.add(p.id, [p.nameEn, p.nameHe, p.nameYi, ...p.aliases]);
  const personFlags = flags(ent.people);
  for (const old of x.aggregates.people.people) {
    let id: string | null = personNames.best([old.en, old.he, ...old.names]);
    let via: LegacyRedirect["via"] = id !== null ? "name" : null;
    if (id === null) {
      const r = ctx.resolve("people", old.key);
      if (r !== null && people.has(r)) [id, via] = [r, "slug"];
    }
    if (id === null) {
      const olds = new Set(old.shiurim.map((s) => s.id).filter((s) => ctx.V.has(s)));
      let best: { id: string; n: number } | null = null;
      if (olds.size > 0) {
        for (const p of x.people.people) {
          let n = 0;
          for (const s of p.shiurIds) if (olds.has(s)) n++;
          if (n >= LEGACY_PERSON_OVERLAP * olds.size && n >= LEGACY_PERSON_OVERLAP * p.shiurIds.length && (!best || n > best.n)) best = { id: p.id, n };
        }
      }
      if (best) [id, via] = [best.id, "overlap"];
    }
    const excluded = id !== null && people.get(id)!.excluded !== null;
    out.push(entry("person", old.key, personFlags.get(old.key), excluded || id === null ? null : { kind: "person", id }, excluded ? null : via));
  }

  // ---- works
  const works = new Set(x.works.works.map((w) => w.id));
  const workNames = new NameIndex();
  for (const w of x.works.works) workNames.add(w.id, [w.titleEn, w.titleHe, w.sefariaIndexTitle, ...w.aliases]);
  const workFlags = flags(ent.works);
  for (const old of x.aggregates.works.works) {
    let id: string | null = workNames.best([old.en, old.he, old.yi, ...old.names]);
    let via: LegacyRedirect["via"] = id !== null ? "name" : null;
    if (id === null) {
      const r = ctx.resolve("works", old.key);
      if (r !== null && works.has(r)) [id, via] = [r, "slug"];
    }
    if (id === null && typeof old.workId === "string" && works.has(old.workId)) [id, via] = [old.workId, "sources"];
    out.push(entry("work", old.key, workFlags.get(old.key), id === null ? null : { kind: "work", id }, via));
  }

  // ---- concepts (every key the aggregate counted; spellings only for the listed ones)
  const concepts = new Map(x.concepts.concepts.map((c) => [c.id, c]));
  const topicIds = new Set(x.topics.tree.filter((t) => t.count > 0).map((t) => t.id));
  const conceptNames = new NameIndex();
  for (const c of x.concepts.concepts) conceptNames.add(c.id, [c.canonicalHe, c.label.en, c.label.yi, ...c.transliterations]);
  const spellings = new Map(x.aggregates.concepts.concepts.map((c) => [c.key, [c.he, ...c.variants]]));
  for (const e of ent.concepts) {
    let id: string | null = conceptNames.best(spellings.get(e.key) ?? []);
    let via: LegacyRedirect["via"] = id !== null ? "name" : null;
    if (id === null) {
      const r = ctx.resolve("concepts", e.key);
      if (r !== null && concepts.has(r)) [id, via] = [r, "slug"];
    }
    let target: LegacyRedirect["target"] = null;
    if (id !== null) {
      const merged = concepts.get(id)!.mergedIntoTopic;
      target = merged !== null ? { kind: "topic", id: merged } : { kind: "concept", id };
    } else {
      // An old concept address whose key is a topic id is that topic's page (plan §3.5).
      const t = ctx.resolve("topics", e.key);
      if (t !== null && topicIds.has(t)) [target, via] = [{ kind: "topic", id: t }, "slug"];
    }
    out.push(entry("concept", e.key, { quiet: e.quietPage, live: e.livePrerender }, target, via));
  }
  const order: Record<LegacyKind, number> = { person: 0, work: 1, concept: 2 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || cmpStr(a.oldKey, b.oldKey));
}

function entry(
  kind: LegacyKind,
  oldKey: string,
  hadPage: { quiet: boolean; live: boolean } | undefined,
  target: LegacyRedirect["target"],
  via: LegacyRedirect["via"],
): LegacyRedirect {
  return { kind, oldKey, hadPage: hadPage ?? { quiet: false, live: false }, target, via: target === null ? null : via };
}
