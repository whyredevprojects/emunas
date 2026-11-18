/**
 * EntityDocs (`.corpus/search/entities.ndjson`, corpus-wave-plan §3.6): one per topic, concept,
 * person and work listed on at least one site. Copied field by field from the layer files; synonyms
 * come only from the layer's synonyms.json (display fields). People of type `other` and excluded
 * people never get one. Stories and threads are second cut.
 */
import { byUiLang, type UiLang } from "@emunas/i18n";
import { synonymKey } from "../layer-types.ts";
import type { EntityDoc, EntityDocFlags, EntityDocKind, EntityDocLabels } from "../types.ts";
import { contentHash } from "./hash.ts";
import { facetIdSets, type LayerFiles } from "./layer.ts";

const nz = (s: string | null | undefined): string | null => {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
};

const flags = (f: { quiet?: unknown; live?: unknown } | null | undefined): EntityDocFlags => ({
  quiet: f?.quiet === true,
  live: f?.live === true,
});

const BOTH: EntityDocFlags = { quiet: true, live: true };

/** A layer `label` (`LocalizedText`) read per interface language. */
const labelIn = (label: Partial<Record<UiLang, unknown>> | null | undefined, l: UiLang): string | null => {
  const v = label?.[l];
  return typeof v === "string" ? v : null;
};

function entityDoc(
  kind: EntityDocKind,
  id: string,
  labels: EntityDocLabels,
  synonyms: ReadonlyMap<string, readonly string[]>,
  count: number,
  listed: EntityDocFlags,
  pages: EntityDocFlags,
  mergedInto: string | null,
): EntityDoc {
  const body: Omit<EntityDoc, "hash"> = {
    kind,
    id,
    labels: byUiLang((l) => nz(labels[l])),
    synonyms: [...(synonyms.get(synonymKey(kind, id)) ?? [])],
    count,
    listed: { quiet: listed.quiet, live: listed.live },
    pages: { quiet: pages.quiet, live: pages.live },
    mergedInto,
  };
  return { ...body, hash: contentHash(body) };
}

const cmp = (a: EntityDoc, b: EntityDoc): number =>
  a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function buildEntityDocs(files: LayerFiles): EntityDoc[] {
  const ok = facetIdSets(files);
  const syn = new Map<string, readonly string[]>();
  for (const s of files.synonyms.synonyms) {
    syn.set(synonymKey(s.kind, s.id), (Array.isArray(s.terms) ? s.terms : []).filter((x): x is string => typeof x === "string"));
  }
  const out: EntityDoc[] = [];
  for (const t of files.topics.tree) {
    if (!ok.topic.has(t.id)) continue;
    out.push(entityDoc("topic", t.id, byUiLang((l) => labelIn(t.label, l)), syn, t.count, BOTH, flags(t.pages), null));
  }
  for (const c of files.concepts.concepts) {
    if (!ok.concept.has(c.id)) continue;
    // Only a topic that is itself listed can be the entry; otherwise the concept stands alone.
    const target = nz(c.mergedIntoTopic);
    const merged = target !== null && ok.topic.has(target) ? target : null;
    out.push(
      entityDoc(
        "concept",
        c.id,
        // `he`: the term itself (canonicalHe) before any translation of its label.
        byUiLang((l) => (l === "he" ? (nz(c.canonicalHe) ?? labelIn(c.label, l)) : labelIn(c.label, l))),
        syn,
        c.count,
        BOTH,
        merged ? { quiet: false, live: false } : flags(c.pages),
        merged,
      ),
    );
  }
  for (const p of files.people.people) {
    if (!ok.person.has(p.id)) continue;
    // A person's names are display fields of the record, one per language that has one.
    const names: EntityDocLabels = { en: p.nameEn, yi: p.nameYi, he: p.nameHe };
    out.push(entityDoc("person", p.id, names, syn, p.count, flags(p.listed), flags(p.pages), null));
  }
  for (const w of files.works.works) {
    if (!ok.work.has(w.id)) continue;
    // Works have no Yiddish title of their own; their Hebrew title is the sefer's name.
    const titles: EntityDocLabels = { en: w.titleEn, yi: null, he: w.titleHe };
    out.push(entityDoc("work", w.id, titles, syn, w.count, BOTH, flags(w.pages), null));
  }
  return out.sort(cmp);
}
