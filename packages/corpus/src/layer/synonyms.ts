/**
 * synonyms.json (corpus-wave-plan §1 rule 1): per entity, the search-folded terms from its own
 * display fields only. Topics: labels and `aliases` (synonyms, never displayed). Concepts:
 * `canonicalHe`, labels and `transliterations`. People: names and `aliases`. Works: titles,
 * `aliases` and `sefariaIndexTitle`. Nothing from an alias map, ASR variant or raw/ file: the input
 * reader cannot open them and this module never sees them. Excluded people and entities with no
 * visible shiur get no entry.
 */
import { fold } from "@emunas/normalize";
import type {
  LayerConceptsFile,
  LayerEntityKind,
  LayerPeopleFile,
  LayerSynonyms,
  LayerSynonymsFile,
  LayerTopicsFile,
  LayerWorksFile,
} from "../public/corpus-layer.ts";
import type { LayerContext } from "./context.ts";

/** Folded, non-empty, deduplicated, in display order. */
export function foldTerms(raw: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r !== "string") continue;
    const f = fold(r);
    if (f.length > 0 && !out.includes(f)) out.push(f);
  }
  return out;
}

export interface SynonymsInput {
  topics: LayerTopicsFile;
  concepts: LayerConceptsFile;
  people: LayerPeopleFile;
  works: LayerWorksFile;
}

export function buildSynonyms(ctx: LayerContext, x: SynonymsInput): LayerSynonymsFile {
  const out: LayerSynonyms[] = [];
  const push = (kind: LayerEntityKind, id: string, raw: (string | null | undefined)[]) => {
    const terms = foldTerms(raw);
    if (terms.length > 0) out.push({ kind, id, terms });
  };
  const topicAliases = new Map(ctx.input.topics.map((t) => [t.id, t.aliases]));
  for (const t of x.topics.tree) {
    if (t.count === 0) continue;
    push("topic", t.id, [t.label.he, t.label.en, t.label.yi, ...(topicAliases.get(t.id) ?? [])]);
  }
  for (const c of x.concepts.concepts) push("concept", c.id, [c.canonicalHe, c.label.en, c.label.yi, ...c.transliterations]);
  for (const p of x.people.people) {
    if (p.excluded !== null || (!p.listed.quiet && !p.listed.live)) continue;
    push("person", p.id, [p.nameHe, p.nameEn, p.nameYi, ...p.aliases]);
  }
  for (const w of x.works.works) push("work", w.id, [w.titleHe, w.titleEn, w.sefariaIndexTitle, ...w.aliases]);
  return { synonyms: out };
}
