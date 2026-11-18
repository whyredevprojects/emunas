/**
 * concepts.json, people.json and works.json (corpus-wave-plan §3.3; Quiet C6 "Who gets a page",
 * Live E.1). Each record is copied field by field. Shiur lists are the entity's own `shiurIds`
 * filtered to the visible set, in catalog order; an entity with no visible shiur is left out.
 * Page and listing flags follow the corpus policy (D2, D5, D10).
 */
import { WORK_GROUPS, foldBasic, lookupWork, type Work as TableWork } from "@emunas/normalize";
import { momentId } from "../public/moment-id.ts";
import { LAYER_PERSON_GROUPS, PERSON_GROUP_OF } from "../public/corpus-layer.ts";
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
import type { PersonIn, WorkIn } from "./input/schemas.ts";
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
    // A sameAs id that moved to another kind (a person now a concept) links as that kind.
    const add = (kind: "concepts" | "people" | "works", raw: string | undefined) => {
      if (raw === undefined) return;
      const r = ctx.resolveRef(kind, raw);
      const m = r?.kind === "concepts" ? links.conceptTopic : r?.kind === "people" ? links.personTopic : r?.kind === "works" ? links.workTopic : null;
      if (r !== null && m !== null && !m.has(r.id)) m.set(r.id, t.id);
    };
    add("concepts", t.sameAs.conceptId);
    add("people", t.sameAs.personId);
    add("works", t.sameAs.workId);
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
      label: ctx.text("concepts", c.id, "label", c.label),
      transliterations: [...c.transliterations],
      definition: ctx.text("concepts", c.id, "definition", c.definition),
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

/** Kinds whose `order` is a shelf position on its own (Tanach 1-39, tractates 100+). */
const DATA_ORDERED_KINDS: ReadonlySet<WorkIn["kind"]> = new Set(["tanach-book", "talmud-tractate", "mishnah-tractate"]);

/**
 * Shelf group from the data where it says enough (Tanach books by `order`, tractates by kind and
 * root collection, liturgy), else the ordering table's group for works the data does not place.
 */
export function shelfGroupOf(w: Pick<WorkIn, "kind" | "order">, root: string, table: TableWork | null): string | null {
  switch (w.kind) {
    case "tanach-book":
      if (w.order === null) return table?.group ?? null;
      return w.order <= 5 ? "torah" : w.order <= 26 ? "neviim" : "kesuvim";
    case "mishnah-tractate":
      return "mishnah";
    case "talmud-tractate":
      return root === "talmud-yerushalmi" ? "yerushalmi" : "bavli";
    case "liturgy":
      return "tefillah";
    default:
      return table?.group ?? null;
  }
}

export function buildWorks(ctx: LayerContext, people: Map<string, PersonBase>, links: SameAsLinks): LayerWorksFile {
  const pol = ctx.policy.thresholds;
  const recs = new Map(ctx.input.works.filter((w) => ctx.isLive("works", w.id)).map((w) => [w.id, w]));
  /** The live parent of a work (a retired parent id is followed), else null. */
  const parentOf = (w: WorkIn): string | null => {
    if (w.parentWorkId === null) return null;
    const p = ctx.resolve("works", w.parentWorkId);
    return p !== null && p !== w.id && recs.has(p) ? p : null;
  };
  /** Ancestors, nearest first; a parent chain that loops counts as none (the work is shelved on its own). */
  const ancestors = (w: WorkIn): string[] => {
    const out: string[] = [];
    for (let p = parentOf(w); p !== null; p = parentOf(recs.get(p)!)) {
      if (p === w.id || out.includes(p)) {
        ctx.warnings.push(`works: parentWorkId of ${w.id} loops (shelved without a parent)`);
        return [];
      }
      out.push(p);
    }
    return out;
  };
  const rows: { w: LayerWork; table: TableWork | null; anc: string[] }[] = [];
  for (const w of recs.values()) {
    const shiurIds = visibleShiurs(ctx, w.shiurIds);
    if (shiurIds.length === 0) continue;
    const table = tableWorkOf(w);
    const anc = ancestors(w);
    const author = w.authorPersonId === null ? null : ctx.resolve("people", w.authorPersonId);
    const authorOk = author !== null && people.has(author) && people.get(author)!.excluded === null;
    const samePerson = people.get(w.id);
    const count = shiurIds.length;
    rows.push({
      table,
      anc,
      w: {
        id: w.id,
        titleHe: w.titleHe,
        titleEn: w.titleEn,
        aliases: [...w.aliases],
        authorPersonId: authorOk ? author : null,
        sefariaIndexTitle: w.sefariaIndexTitle,
        kind: w.kind,
        // Decided once the nesting is known (a genre work with children is a family hub).
        generic: false,
        orderGroup: shelfGroupOf(w, anc.at(-1) ?? w.id, table),
        order: w.order,
        parentWorkId: null,
        shiurIds,
        count,
        sameIdPerson: samePerson && samePerson.excluded === null ? w.id : null,
        sameAsTopic: links.workTopic.get(w.id) ?? null,
        reviewed: w.reviewStatus === "reviewed",
        pages: { quiet: false, live: false },
      },
    });
  }
  // Nesting: the nearest ancestor that is in the file (a parent without visible shiurim is skipped).
  const present = new Set(rows.map((r) => r.w.id));
  for (const r of rows) r.w.parentWorkId = r.anc.find((a) => present.has(a)) ?? null;
  // A genre work with child works in the file (rashi, ramban, talmud-bavli) is a family hub with a
  // page of its own; only a genre work without children is a generic label (listed, never a page).
  const parents = new Set(rows.map((r) => r.w.parentWorkId).filter((p): p is string => p !== null));
  for (const r of rows) {
    const generic = r.w.kind === "genre" && !parents.has(r.w.id);
    r.w.generic = generic;
    r.w.pages = { quiet: !generic && r.w.count >= pol.quiet.workPageMin, live: !generic && r.w.count >= pol.live.workPageMin };
  }

  const byTitle = (a: LayerWork, b: LayerWork) => cmpStr(foldBasic(a.titleEn), foldBasic(b.titleEn)) || cmpStr(a.id, b.id);
  const groupIdx = (r: (typeof rows)[number]) => {
    const i = r.w.orderGroup === null ? -1 : (WORK_GROUPS as readonly string[]).indexOf(r.w.orderGroup);
    return i < 0 ? WORK_GROUPS.length : i;
  };
  const shelfPos = (r: (typeof rows)[number]) =>
    (DATA_ORDERED_KINDS.has(r.w.kind) ? r.w.order : r.table?.order) ?? Number.POSITIVE_INFINITY;
  const top = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    groupIdx(a) - groupIdx(b) || shelfPos(a) - shelfPos(b) || byTitle(a.w, b.w);
  const child = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    (a.w.order ?? Number.POSITIVE_INFINITY) - (b.w.order ?? Number.POSITIVE_INFINITY) || byTitle(a.w, b.w);
  const kids = new Map<string, (typeof rows)[number][]>();
  for (const r of rows) {
    if (r.w.parentWorkId === null) continue;
    const l = kids.get(r.w.parentWorkId) ?? [];
    l.push(r);
    kids.set(r.w.parentWorkId, l);
  }
  const out: LayerWork[] = [];
  const visit = (r: (typeof rows)[number]) => {
    out.push(r.w);
    for (const k of (kids.get(r.w.id) ?? []).sort(child)) visit(k);
  };
  for (const r of rows.filter((x) => x.w.parentWorkId === null).sort(top)) visit(r);
  return { works: out };
}

/**
 * How a story's `people[]` entry is shown: a linked person id, or (a person the sites do not list,
 * or a "person" that is now a concept) that entity's own display name as plain text. A name that
 * resolves to no corpus entity is a raw extraction spelling, possibly an ASR one, and is never
 * published: null.
 */
export function storyPersonOf(ctx: LayerContext, people: Map<string, PersonBase>): (raw: string) => LayerStoryPerson | null {
  const allById = new Map(ctx.input.people.map((p) => [p.id, p]));
  const conceptsById = new Map(ctx.input.concepts.map((c) => [c.id, c]));
  return (raw) => {
    const r = ctx.resolveRef("people", raw);
    // A "person" that is now a concept (Moshiach, the Kohen Gadol): its label, as plain text.
    if (r?.kind === "concepts") {
      const label = conceptsById.get(r.id)?.label.en ?? "";
      return label.trim() === "" ? null : { name: label, linked: false };
    }
    if (r?.kind !== "people") return null;
    const base = people.get(r.id);
    if (base && base.excluded === null) return { id: r.id };
    const name = allById.get(r.id)?.nameEn ?? "";
    return name.trim() === "" ? null : { name, linked: false };
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
    const group = PERSON_GROUP_OF[p.type];
    // D2: the `other` group (type other, and private individuals) gets index lines only.
    const isOther = group === "other";
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
      group,
      groupOrder: LAYER_PERSON_GROUPS.indexOf(group),
      description: p.description === null ? null : ctx.text("people", p.id, "description", p.description),
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
