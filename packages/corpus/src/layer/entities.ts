/**
 * concepts.json, people.json and works.json (corpus-wave-plan §3.3; Quiet C6 "Who gets a page",
 * Live E.1). Each record is copied field by field. Shiur lists are the entity's own `shiurIds`
 * filtered to the visible set, in catalog order; an entity with no visible shiur is left out.
 * Page and listing flags follow the corpus policy (D2, D5, D10).
 */
import { foldBasic, lookupWork, type Work as TableWork, compareWorks } from "@emunas/normalize";
import { momentId } from "../public/moment-id.ts";
import type {
  LayerConcept,
  LayerConceptsFile,
  LayerExcludedReason,
  LayerPeopleFile,
  LayerPerson,
  LayerStoriesFile,
  LayerStoryPerson,
  LayerWork,
  LayerWorksFile,
} from "../public/corpus-layer.ts";
import { cmpStr, type LayerContext } from "./context.ts";
import { PERSON_TYPES, type PersonIn, type WorkIn } from "./input/schemas.ts";
import { familyRegExp } from "./policy.ts";

/** Explicit same-subject links from `topics[].sameAs`, resolved to live ids. */
export interface SameAsLinks {
  /** concept id → topic id (the concept is merged into the topic page). */
  conceptTopic: Map<string, string>;
  personTopic: Map<string, string>;
  workTopic: Map<string, string>;
}

export function sameAsLinks(ctx: LayerContext): SameAsLinks {
  const links: SameAsLinks = { conceptTopic: new Map(), personTopic: new Map(), workTopic: new Map() };
  for (const t of ctx.input.topics) {
    if (!ctx.isLive("topics", t.id) || !t.sameAs) continue;
    const add = (m: Map<string, string>, kind: "concepts" | "people" | "works", raw: string | undefined) => {
      if (raw === undefined) return;
      const id = ctx.resolve(kind, raw);
      if (id !== null && !m.has(id)) m.set(id, t.id);
    };
    add(links.conceptTopic, "concepts", t.sameAs.conceptId);
    add(links.personTopic, "people", t.sameAs.personId);
    add(links.workTopic, "works", t.sameAs.workId);
  }
  return links;
}

/** Visible shiur ids (deduplicated, catalog order). */
export function visibleShiurs(ctx: LayerContext, ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => ctx.V.has(id)))].sort(ctx.cmpCatalog);
}

// ---------------------------------------------------------------- concepts

export function buildConcepts(ctx: LayerContext, links: SameAsLinks): LayerConceptsFile {
  const total = ctx.visibleIds.length;
  const pol = ctx.policy.thresholds;
  const out: LayerConcept[] = [];
  for (const c of ctx.input.concepts) {
    if (!ctx.isLive("concepts", c.id)) continue;
    const shiurIds = visibleShiurs(ctx, c.shiurIds);
    if (shiurIds.length === 0) continue;
    const exampleRefs: LayerConcept["exampleRefs"] = [];
    const seen = new Set<string>();
    for (const r of c.exampleRefs) {
      if (!ctx.V.isVisibleExampleRef(r)) continue;
      const ch = ctx.chapter(r.shiurId, r.sectionIndex);
      const mid = momentId(r.shiurId, "s", r.sectionIndex);
      if (!ch || seen.has(mid)) continue;
      seen.add(mid);
      exampleRefs.push({ shiurId: r.shiurId, sectionIndex: r.sectionIndex, momentId: mid, t: ch.t });
    }
    const count = shiurIds.length;
    const merged = links.conceptTopic.get(c.id) ?? null;
    out.push({
      id: c.id,
      canonicalHe: c.canonicalHe,
      label: { en: c.label.en, yi: c.label.yi },
      transliterations: [...c.transliterations],
      definition: { en: c.definition.en, yi: c.definition.yi },
      shiurIds,
      count,
      exampleRefs,
      passim: count * pol.quiet.conceptPassimOneIn > total,
      liveFacetDrop: count * pol.live.conceptFacetDropOneIn > total,
      mergedIntoTopic: merged,
      reviewed: c.reviewStatus === "reviewed",
      pages: {
        quiet: merged === null && count >= pol.quiet.conceptPageMin,
        live: merged === null && count >= pol.live.conceptPageMin,
      },
    });
  }
  out.sort((a, b) => cmpStr(a.id, b.id));
  return { concepts: out };
}

// ---------------------------------------------------------------- people (base) and works

export interface PersonBase {
  rec: PersonIn;
  shiurIds: string[];
  excluded: LayerExcludedReason | null;
}

/** Why a person is excluded (D5): owner list, family (own fields or flag), private flag. */
export function exclusionOf(p: PersonIn, ctx: LayerContext): LayerExcludedReason | null {
  const pol = ctx.policy.people;
  if (pol.excludeIds.includes(p.id)) return "owner";
  if (pol.excludeFamily) {
    const re = familyRegExp(ctx.policy);
    if (p.family === true || [p.nameEn, ...p.aliases].some((x) => re.test(x))) return "family";
  }
  if (p.private === true) return "private";
  return null;
}

/** Live people with at least one visible shiur, with their exclusion. */
export function peopleBase(ctx: LayerContext): Map<string, PersonBase> {
  const out = new Map<string, PersonBase>();
  for (const p of ctx.input.people) {
    if (!ctx.isLive("people", p.id)) continue;
    const shiurIds = visibleShiurs(ctx, p.shiurIds);
    if (shiurIds.length === 0) continue;
    out.set(p.id, { rec: p, shiurIds, excluded: exclusionOf(p, ctx) });
  }
  return out;
}

/** The ordering-table row for a work, matched through its own display names. */
export function tableWorkOf(w: Pick<WorkIn, "titleEn" | "titleHe" | "aliases" | "sefariaIndexTitle">): TableWork | null {
  const names = [w.titleEn, w.sefariaIndexTitle, ...w.aliases, w.titleHe].filter((x): x is string => typeof x === "string" && x.trim() !== "");
  for (const n of names) {
    const m = lookupWork(n);
    if (m.work) return m.work;
  }
  return null;
}

const GENERIC_KINDS = new Set(["generic", "genre"]);

export function buildWorks(ctx: LayerContext, people: Map<string, PersonBase>, links: SameAsLinks): LayerWorksFile {
  const pol = ctx.policy.thresholds;
  const rows: { w: LayerWork; table: TableWork | null }[] = [];
  for (const w of ctx.input.works) {
    if (!ctx.isLive("works", w.id)) continue;
    const shiurIds = visibleShiurs(ctx, w.shiurIds);
    if (shiurIds.length === 0) continue;
    const table = tableWorkOf(w);
    const generic = w.kind !== undefined ? GENERIC_KINDS.has(w.kind.toLowerCase()) : (table?.genre ?? false);
    const author = w.authorPersonId === null ? null : ctx.resolve("people", w.authorPersonId);
    const authorOk = author !== null && people.has(author) && people.get(author)!.excluded === null;
    const samePerson = people.get(w.id);
    const count = shiurIds.length;
    rows.push({
      table,
      w: {
        id: w.id,
        titleHe: w.titleHe,
        titleEn: w.titleEn,
        aliases: [...w.aliases],
        authorPersonId: authorOk ? author : null,
        sefariaIndexTitle: w.sefariaIndexTitle,
        generic,
        orderGroup: table?.group ?? null,
        order: table?.order ?? null,
        shiurIds,
        count,
        sameIdPerson: samePerson && samePerson.excluded === null ? w.id : null,
        sameAsTopic: links.workTopic.get(w.id) ?? null,
        reviewed: w.reviewStatus === "reviewed",
        pages: { quiet: !generic && count >= pol.quiet.workPageMin, live: !generic && count >= pol.live.workPageMin },
      },
    });
  }
  rows.sort((a, b) => {
    if (a.table && b.table) return compareWorks(a.table, b.table) || cmpStr(foldBasic(a.w.titleEn), foldBasic(b.w.titleEn)) || cmpStr(a.w.id, b.w.id);
    if (a.table) return -1;
    if (b.table) return 1;
    return cmpStr(foldBasic(a.w.titleEn), foldBasic(b.w.titleEn)) || cmpStr(a.w.id, b.w.id);
  });
  return { works: rows.map((r) => r.w) };
}

/** How a story's `people[]` entry is shown: linked id, or plain text (unresolved, excluded or invisible). */
export function storyPersonOf(ctx: LayerContext, people: Map<string, PersonBase>): (raw: string) => LayerStoryPerson {
  const allById = new Map(ctx.input.people.map((p) => [p.id, p]));
  return (raw) => {
    const id = ctx.resolve("people", raw);
    const base = id === null ? undefined : people.get(id);
    if (id !== null && base && base.excluded === null) return { id };
    const rec = id === null ? undefined : allById.get(id);
    return { name: rec ? rec.nameEn : raw, linked: false };
  };
}

// ---------------------------------------------------------------- people (final)

export function buildPeople(
  ctx: LayerContext,
  people: Map<string, PersonBase>,
  works: LayerWorksFile,
  stories: LayerStoriesFile,
  links: SameAsLinks,
): LayerPeopleFile {
  const pol = ctx.policy;
  const storiesOf = new Map<string, string[]>();
  for (const s of stories.stories) {
    for (const p of s.people) {
      if (!("id" in p)) continue;
      const l = storiesOf.get(p.id) ?? [];
      if (!l.includes(s.id)) l.push(s.id);
      storiesOf.set(p.id, l);
    }
  }
  const authored = new Map<string, string[]>();
  const workIds = new Set<string>();
  for (const w of works.works) {
    workIds.add(w.id);
    if (w.authorPersonId === null) continue;
    const l = authored.get(w.authorPersonId) ?? [];
    l.push(w.id);
    authored.set(w.authorPersonId, l);
  }
  const out: LayerPerson[] = [];
  for (const [id, b] of people) {
    const p = b.rec;
    const count = b.shiurIds.length;
    const excluded = b.excluded;
    const isOther = p.type === "other";
    const quietPage = excluded === null && (isOther ? pol.people.other.pages : true) && count >= pol.thresholds.quiet.personPageMin;
    const livePage = excluded === null && (isOther ? pol.people.other.pages : true) && count >= pol.thresholds.live.personPageMin;
    const quietListed = excluded === null && (isOther ? count >= pol.people.other.quietLineMinShiurim : true);
    const liveListed = excluded === null && (isOther ? pol.people.other.liveListed : livePage);
    out.push({
      id,
      nameHe: p.nameHe,
      nameEn: p.nameEn,
      nameYi: p.nameYi,
      aliases: [...p.aliases],
      type: p.type,
      typeOrder: PERSON_TYPES.indexOf(p.type),
      shiurIds: b.shiurIds,
      count,
      storyIds: excluded === null ? [...(storiesOf.get(id) ?? [])].sort(cmpStr) : [],
      worksAuthored: excluded === null ? [...(authored.get(id) ?? [])] : [],
      sameIdWork: excluded === null && workIds.has(id) ? id : null,
      sameAsTopic: links.personTopic.get(id) ?? null,
      excluded,
      listed: { quiet: quietListed, live: liveListed },
      pages: { quiet: quietPage, live: livePage },
      quietAllList: quietPage && count >= pol.thresholds.quiet.personAllListMin,
      reviewed: p.reviewStatus === "reviewed",
    });
  }
  out.sort((a, b) => cmpStr(a.id, b.id));
  return { people: out };
}
