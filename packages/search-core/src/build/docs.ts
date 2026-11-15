/**
 * SearchDoc and MomentRow builders. They copy allowed fields one by one from a `PublicShiur`
 * (never spread or strip), so nothing reaches the index unless it is mapped here on purpose.
 */
import type { L, PublicShiur } from "@emunas/corpus/public";
import { parshaLabels, yearLabels, zmanLabels } from "../text.ts";
import type {
  DocFacets,
  MomentEntities,
  MomentFacets,
  MomentRow,
  MomentRowKind,
  SearchDoc,
  SearchDocSource,
  SearchInput,
} from "../types.ts";
import { contentHash } from "./hash.ts";

const nz = (s: string | null | undefined): string | null => {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
};

/** A copy of an `L` with only `en`/`yi`, or null when both are empty (e.g. suppressed). */
function lcopy(l: L | null | undefined): L | null {
  if (!l) return null;
  const en = nz(l.en) ?? "";
  const yi = nz(l.yi) ?? "";
  return en === "" && yi === "" ? null : { en, yi };
}

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

export function buildSearchDoc(input: SearchInput): SearchDoc {
  const s = input.shiur;
  const n = s.status === "full" ? s.notes : undefined;
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
    works: sortedUniq((n?.sources ?? []).map((x) => x.workKey)),
    people: sortedUniq([...(n?.people ?? []).map((p) => p.key), ...(n?.stories ?? []).flatMap((st) => st.peopleKeys)]),
    concepts: sortedUniq((n?.concepts ?? []).map((c) => c.key)),
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
          : { title: title ?? { en: "", yi: "" }, summary: summary ?? { en: "", yi: "" } };
      })
      .filter(present),
    storyTitles: (n?.stories ?? []).map((st) => lcopy(st.title)).filter(present),
    questions: (n?.questions ?? []).map((q) => lcopy(q.q)).filter(present),
    sources,
    people: uniq([...(n?.people ?? []).map((p) => p.name), ...(n?.stories ?? []).flatMap((st) => st.people)]),
    concepts: uniq((n?.concepts ?? []).map((c) => c.he)),
    // C9: candidateTopics only here, and only for shiurim that passed the status gate.
    keywords: n ? uniq(input.candidateTopics) : [],
    facets,
  };
  return { ...body, hash: contentHash(body) };
}

function joinLines(xs: (string | null)[]): string | null {
  return nz(xs.filter((x): x is string => x !== null && x.trim() !== "").join("\n"));
}

/** Moment rows of one shiur (none for catalog-only shiurim). */
export function buildMomentRows(shiur: PublicShiur): MomentRow[] {
  const n = shiur.status === "full" ? shiur.notes : undefined;
  if (!n) return [];
  const base = {
    category: shiur.category,
    occasion: shiur.parsha?.key ?? shiur.zman?.key ?? null,
    series: shiur.series?.id ?? null,
    year: shiur.years[0] ?? null,
    catalogued: catalogued(shiur),
  };
  const rows: MomentRow[] = [];
  const noEntities = (): MomentEntities => ({ works: [], people: [], concepts: [] });

  function add(p: {
    id: string;
    kind: MomentRowKind;
    t: number | null;
    end: number | null;
    title: L | null;
    body: L | null;
    entities?: MomentEntities;
    soft?: true | undefined;
  }): void {
    if (p.t === null) return;
    const title_en = nz(p.title?.en);
    const title_yi = nz(p.title?.yi);
    const body_en = nz(p.body?.en);
    const body_yi = nz(p.body?.yi);
    if (title_en === null && title_yi === null && body_en === null && body_yi === null) return;
    const facets: MomentFacets = { ...base, soft: p.soft === true };
    const row: Omit<MomentRow, "hash"> = {
      id: p.id,
      shiurId: shiur.id,
      kind: p.kind,
      t: p.t,
      end: p.end,
      lang: shiur.lang,
      title_en,
      title_yi,
      body_en,
      body_yi,
      entities: p.entities ?? noEntities(),
      facets,
    };
    rows.push({ ...row, hash: contentHash(row) });
  }

  const inRange = (t: number | null, from: number, to: number) => t !== null && t >= from && t < to;

  for (const c of n.chapters) {
    const subs = (ed: "en" | "yi") =>
      c.sub.map((x) => {
        const title = nz(x.title[ed]);
        const summary = nz(x.summary[ed]);
        return title && summary ? `${title}: ${summary}` : (title ?? summary);
      });
    add({
      id: c.id,
      kind: "section",
      t: c.t,
      end: c.end,
      title: c.title,
      body: { en: joinLines([c.summary.en, ...subs("en")]) ?? "", yi: joinLines([c.summary.yi, ...subs("yi")]) ?? "" },
      entities: {
        works: sortedUniq(n.sources.filter((x) => inRange(x.t, c.t, c.end)).map((x) => x.workKey)),
        people: sortedUniq(n.stories.filter((st) => inRange(st.t, c.t, c.end)).flatMap((st) => st.peopleKeys)),
        concepts: [],
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
      entities: { works: [], people: sortedUniq(st.peopleKeys), concepts: [] },
      soft: st.soft,
    });
  }
  const chapterByIdx = new Map(n.chapters.map((c) => [c.idx, c]));
  for (const ed of ["en", "yi"] as const) {
    for (const b of n.writeup[ed]) {
      const c = chapterByIdx.get(b.sectionIndex);
      const heading = nz(b.heading);
      const title: L = { en: c?.title.en ?? "", yi: c?.title.yi ?? "" };
      if (heading !== null) title[ed] = heading;
      for (const p of b.paragraphs) {
        add({
          id: p.id,
          kind: "writeup",
          t: p.t,
          end: p.end,
          title,
          body: ed === "en" ? { en: p.text, yi: "" } : { en: "", yi: p.text },
          entities: { works: sortedUniq(p.src.map((k) => n.sources[k]?.workKey)), people: [], concepts: [] },
        });
      }
    }
  }
  return rows;
}
