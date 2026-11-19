/**
 * SearchDoc and MomentRow builders. They copy allowed fields one by one from a `PublicShiur`
 * (never spread or strip), so nothing reaches the index unless it is mapped here on purpose.
 * Keywords, facet ids and moment entities come from the corpus layer (`SearchLayer`).
 */
import type { LayerShiurRefs, PublicShiur } from "@emunas/corpus/public";
import { SOURCE_LANGS, UI_LANGS, type LocalizedText, type SourceLang, type UiLang } from "@emunas/i18n";
import { fold } from "@emunas/normalize";
import { synonymKey, type SearchLayer } from "../layer-types.ts";
import { parshaLabels, yearLabels, zmanLabels } from "../text.ts";
import type {
  DocFacets,
  MomentEntities,
  MomentFacets,
  MomentRow,
  MomentRowKind,
  MomentRowTexts,
  SearchDoc,
  SearchDocSource,
  SearchInput,
} from "../types.ts";
import { MOMENT_ROW_TEXT_FIELDS, momentRowTextField } from "../types.ts";
import { contentHash } from "./hash.ts";

const nz = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
};

const isSource = (l: UiLang): l is SourceLang => (SOURCE_LANGS as readonly UiLang[]).includes(l);

/**
 * A copy of a `LocalizedText`, language by language in `UI_LANGS` order (trimmed): the source
 * languages always (blank as ""), a translated language only when non-blank. Null when every
 * language is blank (e.g. suppressed). Unknown keys are not copied.
 */
export function lcopy(l: Partial<Record<UiLang, string | null | undefined>> | null | undefined): LocalizedText | null {
  if (!l) return null;
  const out: Partial<Record<UiLang, string>> = {};
  let any = false;
  for (const lang of UI_LANGS) {
    const v = nz(l[lang]);
    if (v !== null) any = true;
    if (v !== null || isSource(lang)) out[lang] = v ?? "";
  }
  return any ? (out as LocalizedText) : null;
}

/** An all-blank `LocalizedText` (a section with only a title or only a summary). */
const BLANK: LocalizedText = { en: "", yi: "" };

const present = <T>(x: T | null): x is T => x !== null;

function uniq(xs: Iterable<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const x of xs) {
    const v = nz(x);
    if (v !== null && !out.includes(v)) out.push(v);
  }
  return out;
}

const sortedUniq = (xs: Iterable<string | null | undefined>): string[] => uniq(xs).sort();

const catalogued = (s: PublicShiur): boolean => s.catalog.source === "pocket-guide-2012";

/** Shiur-level topics at or above this salience are a moment's topics (outside section rows). */
export const MOMENT_TOPIC_SALIENCE = 0.6;

/** The layer refs of a full shiur, or null. */
function refsOf(shiur: PublicShiur, layer: SearchLayer | null | undefined): LayerShiurRefs | null {
  if (!layer || shiur.status !== "full") return null;
  return layer.refs.get(shiur.id) ?? null;
}

const listOf = <T>(x: readonly T[] | undefined | null): readonly T[] => (Array.isArray(x) ? x : []);

/** Visible topic ids of a shiur: shiur level (by salience), then section level. */
function shiurTopicIds(refs: LayerShiurRefs, layer: SearchLayer): string[] {
  const ids = [...listOf(refs.topics).map((t) => t.id), ...listOf(refs.chapters).flatMap((c) => listOf(c.topicIds))];
  return uniq(ids).filter((id) => layer.topics.has(id));
}

/** Topic labels (every language) and the topics' own aliases, deduplicated after folding. */
export function topicKeywords(topicIds: readonly string[], layer: SearchLayer): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (x: string | null | undefined) => {
    const v = nz(x);
    if (v === null) return;
    const f = fold(v);
    if (f === "" || seen.has(f)) return;
    seen.add(f);
    out.push(v);
  };
  for (const id of topicIds) {
    const t = layer.topics.get(id);
    if (!t) continue;
    for (const l of UI_LANGS) push(t[l]);
  }
  for (const id of topicIds) for (const a of layer.synonyms.get(synonymKey("topic", id)) ?? []) push(a);
  return out;
}

const keep = (set: ReadonlySet<string> | undefined, ids: Iterable<string | null | undefined>): string[] =>
  sortedUniq([...ids].filter((x) => typeof x === "string" && set !== undefined && set.has(x)));

/** Display names of the shiur's people and of the people of its merged stories, from the layer. */
function personNamesOf(refs: LayerShiurRefs, layer: SearchLayer): string[] {
  return uniq([
    ...listOf(refs.personIds).flatMap((id) => layer.personNames.get(id) ?? []),
    ...listOf(refs.stories).flatMap((x) => layer.storyNames.get(x.storyId) ?? []),
  ]);
}

/** Build one SearchDoc. */
export function buildSearchDoc(input: SearchInput): SearchDoc {
  const s = input.shiur;
  const layer = input.layer ?? null;
  const n = s.status === "full" ? s.notes : undefined;
  const refs = refsOf(s, layer);
  const sources: SearchDocSource[] = [];
  for (const x of n?.sources ?? []) {
    const work = nz(x.work);
    const ref = nz(x.ref);
    if (work === null && ref === null) continue;
    if (!sources.some((y) => y.work === work && y.ref === ref)) sources.push({ work, ref });
  }
  const facets: DocFacets = {
    parsha: s.parsha?.key ?? null,
    zman: s.zman?.key ?? null,
    series: s.series?.id ?? null,
    years: [...s.years],
    catalogued: catalogued(s),
    works: refs && layer ? keep(layer.facetIds.work, listOf(refs.workIds)) : [],
    people: refs && layer ? keep(layer.facetIds.person, listOf(refs.personIds)) : [],
    concepts: refs && layer ? keep(layer.facetIds.concept, listOf(refs.conceptIds)) : [],
    topics: refs && layer ? sortedUniq(shiurTopicIds(refs, layer)) : [],
  };
  const body: Omit<SearchDoc, "hash"> = {
    id: s.id,
    kind: "shiur",
    lang: s.lang,
    category: s.category,
    status: s.status,
    titleOriginal: s.catalog.titleOriginal,
    heading: nz(s.catalog.heading),
    subTitle: nz(s.catalog.subTitle),
    parsha: parshaLabels(s.parsha),
    zman: zmanLabels(s.zman),
    years: yearLabels(s.years),
    catalogTopics: uniq(s.catalog.topics),
    oneLiner: lcopy(n?.summary.oneLiner),
    abstract: lcopy(n?.summary.abstract),
    keyPoints: (n?.summary.keyPoints ?? []).map((m) => lcopy(m.text)).filter(present),
    sections: (n?.chapters ?? [])
      .map((c) => {
        const title = lcopy(c.title);
        const summary = lcopy(c.summary);
        return title === null && summary === null
          ? null
          : { title: title ?? BLANK, summary: summary ?? BLANK };
      })
      .filter(present),
    storyTitles: (n?.stories ?? []).map((st) => lcopy(st.title)).filter(present),
    questions: (n?.questions ?? []).map((q) => lcopy(q.q)).filter(present),
    sources,
    // Names only from the corpus layer (entities' own display names); raw extraction names, which
    // may be ASR mishearings, are never indexed (F.1). Without layer refs: none.
    people: refs && layer ? personNamesOf(refs, layer) : [],
    concepts: refs && layer ? uniq(listOf(refs.conceptIds).flatMap((id) => layer.conceptNames.get(id) ?? [])) : [],
    // Topic labels and aliases only here, and only for full shiurim in the visible set.
    keywords: refs && layer ? topicKeywords(shiurTopicIds(refs, layer), layer) : [],
    facets,
  };
  return { ...body, hash: contentHash(body) };
}

function joinLines(xs: (string | null)[]): string | null {
  return nz(xs.filter((x): x is string => x !== null && x.trim() !== "").join("\n"));
}

/** Text per language as the row builder takes it (missing or null: none in that language). */
type Text = Partial<Record<UiLang, string | null>>;

/** Moment rows of one shiur (none for catalog-only shiurim). Entities need the layer. */
export function buildMomentRows(shiur: PublicShiur, layer?: SearchLayer | null): MomentRow[] {
  const n = shiur.status === "full" ? shiur.notes : undefined;
  if (!n) return [];
  const refs = refsOf(shiur, layer);
  const workOf = new Map<string, string>();
  const storyOf = new Map<string, string>();
  const chapterTopics = new Map<number, string[]>();
  let mainTopics: string[] = [];
  if (refs && layer) {
    for (const x of listOf(refs.sources)) if (layer.facetIds.work.has(x.workId)) workOf.set(x.momentId, x.workId);
    for (const x of listOf(refs.stories)) storyOf.set(x.momentId, x.storyId);
    for (const c of listOf(refs.chapters)) chapterTopics.set(c.idx, keep(layer.facetIds.topic, listOf(c.topicIds)));
    mainTopics = keep(
      layer.facetIds.topic,
      listOf(refs.topics)
        .filter((t) => t.salience >= MOMENT_TOPIC_SALIENCE)
        .map((t) => t.id),
    );
  }
  const storyPeople = (momentId: string): string[] => {
    const storyId = storyOf.get(momentId);
    return storyId === undefined ? [] : [...(layer?.storyPeople.get(storyId) ?? [])];
  };
  const base = {
    category: shiur.category,
    occasion: shiur.parsha?.key ?? shiur.zman?.key ?? null,
    series: shiur.series?.id ?? null,
    year: shiur.years[0] ?? null,
    catalogued: catalogued(shiur),
  };
  const rows: MomentRow[] = [];
  const noEntities = (): MomentEntities => ({ works: [], people: [], concepts: [], topics: [...mainTopics] });

  function add(p: {
    id: string;
    kind: MomentRowKind;
    t: number | null;
    end: number | null;
    title: Text | null;
    body: Text | null;
    entities?: MomentEntities;
    soft?: true | undefined;
  }): void {
    if (p.t === null) return;
    const texts = {} as MomentRowTexts;
    // In MOMENT_ROW_TEXT_FIELDS order: every title, then every body.
    for (const l of UI_LANGS) texts[momentRowTextField("title", l)] = nz(p.title?.[l]);
    for (const l of UI_LANGS) texts[momentRowTextField("body", l)] = nz(p.body?.[l]);
    if (MOMENT_ROW_TEXT_FIELDS.every((f) => texts[f] === null)) return;
    const facets: MomentFacets = { ...base, soft: p.soft === true };
    const row: Omit<MomentRow, "hash"> = {
      id: p.id,
      shiurId: shiur.id,
      kind: p.kind,
      t: p.t,
      end: p.end,
      lang: shiur.lang,
      ...texts,
      entities: p.entities ?? noEntities(),
      facets,
    };
    rows.push({ ...row, hash: contentHash(row) });
  }

  const inRange = (t: number | null, from: number, to: number) => t !== null && t >= from && t < to;

  for (const c of n.chapters) {
    const subs = (l: UiLang) =>
      c.sub.map((x) => {
        const title = nz(x.title[l]);
        const summary = nz(x.summary[l]);
        return title && summary ? `${title}: ${summary}` : (title ?? summary);
      });
    const body: Text = {};
    for (const l of UI_LANGS) body[l] = joinLines([c.summary[l] ?? null, ...subs(l)]);
    add({
      id: c.id,
      kind: "section",
      t: c.t,
      end: c.end,
      title: c.title,
      body,
      entities: {
        works: sortedUniq(n.sources.filter((x) => inRange(x.t, c.t, c.end)).map((x) => workOf.get(x.id))),
        people: sortedUniq(n.stories.filter((st) => inRange(st.t, c.t, c.end)).flatMap((st) => storyPeople(st.id))),
        concepts: [...(layer?.sectionConcepts.get(c.id) ?? [])],
        topics: [...(chapterTopics.get(c.idx) ?? [])],
      },
    });
  }
  for (const m of n.summary.keyPoints) add({ id: m.id, kind: "keypoint", t: m.t, end: m.end, title: m.text, body: null, soft: m.soft });
  for (const m of n.insights) add({ id: m.id, kind: "insight", t: m.t, end: m.end, title: m.text, body: null, soft: m.soft });
  for (const m of n.takeaways) add({ id: m.id, kind: "takeaway", t: m.t, end: m.end, title: m.text, body: null, soft: m.soft });
  for (const q of n.questions) add({ id: q.id, kind: "question", t: q.tq ?? q.ta, end: null, title: q.q, body: q.a, soft: q.soft });
  for (const st of n.stories) {
    add({
      id: st.id,
      kind: "story",
      t: st.t,
      end: st.end,
      title: st.title,
      body: st.retelling,
      entities: { works: [], people: storyPeople(st.id), concepts: [], topics: [...mainTopics] },
      soft: st.soft,
    });
  }
  const chapterByIdx = new Map(n.chapters.map((c) => [c.idx, c]));
  // One write-up per language the shiur has one in (`en`, `yi`, and a current translation such as
  // `he`); a paragraph's body is only in its own language, its title is the chapter's title in
  // every language with the block's heading in its own.
  for (const ed of UI_LANGS) {
    for (const b of n.writeup[ed] ?? []) {
      const c = chapterByIdx.get(b.sectionIndex);
      const heading = nz(b.heading);
      const title: Text = {};
      for (const l of UI_LANGS) title[l] = c?.title[l] ?? null;
      if (heading !== null) title[ed] = heading;
      for (const p of b.paragraphs) {
        add({
          id: p.id,
          kind: "writeup",
          t: p.t,
          end: p.end,
          title,
          body: { [ed]: p.text },
          entities: {
            works: sortedUniq(p.src.map((k) => {
              const id = n.sources[k]?.id;
              return id === undefined ? undefined : workOf.get(id);
            })),
            people: [],
            concepts: [],
            topics: [...mainTopics],
          },
        });
      }
    }
  }
  return rows;
}
