/**
 * Pure models of the shared corpus-entry components (C1.8). The `.astro` files only lay these out,
 * so the rules are tested once:
 *
 * - `headword`: the entry's name in the edition's script, with the Hebrew beside the English
 *   (Quiet C4: "Hebrew beside English").
 * - `reportEntryHref`: the plain mail link pre-filled with the kind and id of the entry and the
 *   three things that actually go wrong (Quiet C6 "Reporting"). Null without an address.
 * - `gradeListModel`: a topic's three grades (Quiet C4.1 part 4): the shiurim it is about
 *   (principal rows), those that discuss it (plain rows), and those that touch it in one part (one
 *   line per shiur with a link to each tagged part, at its time). Only shiurim the caller can cite
 *   are kept, so a shiur outside the corpus is never linked.
 * - `indexesBlock`: the title page's indexes, in the order of Quiet C5, with counts from the layer.
 */
import { corpusLabel, type CorpusLabelKey } from "@emunas/i18n";
import { formatQuiet, type CorpusKind, type IndexName } from "@emunas/links";
import type { LayerTopicDetail } from "@emunas/corpus/public";
import { clock } from "../../lib/bidi.ts";
import type { Ed } from "../../lib/edition.ts";
import { run, sectionHref, type Cite, type Run } from "../indexes/model.ts";
import type { LayerIndexCounts } from "./layer.ts";
import { useCorpusT, type CorpusKey } from "./strings.ts";

// ------------------------------------------------------------------ headword

export interface Headword {
  readonly title: Run;
  /** The Hebrew beside it (null when it is the same text or missing). */
  readonly alt: Run | null;
}

/** Names of an entry as the layer gives them (any may be missing). */
export interface EntryNames {
  readonly en?: string | null;
  readonly yi?: string | null;
  readonly he?: string | null;
}

const clean = (s: string | null | undefined): string => (typeof s === "string" ? s.trim() : "");

/**
 * The headword in the edition's language (English edition: English; Yiddish edition: Yiddish, else
 * Hebrew), with the Hebrew beside it when it differs. Falls back across the names, so an entry with
 * one name still has a headword.
 */
export function headword(ed: Ed, names: EntryNames): Headword {
  const en = clean(names.en);
  const yi = clean(names.yi);
  const he = clean(names.he);
  const main = ed === "en" ? en || he || yi : yi || he || en;
  const beside = he !== "" && he !== main ? he : null;
  return { title: run(main, ed), alt: beside ? run(beside, ed) : null };
}

// ------------------------------------------------------------------ report an error

const EMAIL_RE = /^[^\s@<>"?&#]+@[^\s@<>"?&#]+\.[^\s@<>"?&#]+$/;

/** The subject and body of an error report about one entry. */
export function reportEntryMail(ed: Ed, kind: CorpusKind, id: string, pageUrl: string): { subject: string; body: string } {
  const kindName = corpusLabel(`kind.${kind}` as CorpusLabelKey, ed);
  const t = useCorpusT(ed);
  return {
    subject: corpusLabel("report.subject", ed, { kind: kindName, id }),
    body: t("report.body", {
      kind: kindName,
      id,
      url: pageUrl,
      twoDifferent: corpusLabel("report.twoDifferent", ed),
      sameAsOther: corpusLabel("report.sameAsOther", ed),
      doesNotBelong: corpusLabel("report.doesNotBelong", ed),
    }),
  };
}

/**
 * `mailto:` link pre-filled with the entry's kind and id and the three options, or null when no
 * (valid) address is configured: the page then leaves the link out.
 */
export function reportEntryHref(address: string | null | undefined, ed: Ed, kind: CorpusKind, id: string, pageUrl: string): string | null {
  const to = address?.trim();
  if (!to || !EMAIL_RE.test(to)) return null;
  const { subject, body } = reportEntryMail(ed, kind, id, pageUrl);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ------------------------------------------------------------------ grades

export interface TouchedPart {
  readonly idx: number;
  readonly t: number;
  /** The shiur page at that part (`#s{idx}`). */
  readonly href: string;
  /** The time as printed (`12:34`). */
  readonly time: string;
}

export interface TouchedLine {
  readonly cite: Cite;
  readonly parts: readonly TouchedPart[];
}

export interface GradeListModel {
  /** The shiur is about this (salience ≥ 0.6): principal rows. */
  readonly main: readonly Cite[];
  /** Discussed in the shiur: plain rows. */
  readonly discussed: readonly Cite[];
  /** Touched on in one part: one line per shiur, a time link per part. */
  readonly touched: readonly TouchedLine[];
}

/** Cites a shiur at a time (null: link to the shiur itself), or null when the shiur cannot be cited. */
export type CiteFn = (shiurId: string, t: number | null) => Cite | null;

/** The three grades of a topic as rows, in the layer's order (catalog order). */
export function gradeListModel(ed: Ed, grades: Partial<LayerTopicDetail["grades"]> | null | undefined, cite: CiteFn): GradeListModel {
  const rows = (list: readonly { shiurId?: unknown }[] | undefined): Cite[] => {
    const out: Cite[] = [];
    const seen = new Set<string>();
    for (const r of Array.isArray(list) ? list : []) {
      if (typeof r?.shiurId !== "string" || seen.has(r.shiurId)) continue;
      const c = cite(r.shiurId, null);
      if (c) {
        seen.add(r.shiurId);
        out.push(c);
      }
    }
    return out;
  };
  const touched: TouchedLine[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(grades?.touched) ? grades.touched : []) {
    if (typeof r?.shiurId !== "string" || seen.has(r.shiurId)) continue;
    const c = cite(r.shiurId, null);
    if (!c) continue;
    seen.add(r.shiurId);
    const parts = (Array.isArray(r.chapters) ? r.chapters : [])
      .filter((ch) => Number.isInteger(ch?.idx) && typeof ch?.t === "number" && Number.isFinite(ch.t))
      .map((ch) => ({ idx: ch.idx, t: ch.t, href: sectionHref(ed, r.shiurId, ch.idx), time: clock(ch.t) }));
    touched.push({ cite: c, parts });
  }
  return { main: rows(grades?.main), discussed: rows(grades?.discussed), touched };
}

// ------------------------------------------------------------------ the indexes block

export type IndexLineId = "topics" | "glossary" | "names" | "sources" | "stories" | "calendar" | "years";

/** Quiet C5: ענינים · ערכים · שמות · מראי מקומות · מעשיות · לוח · שנים. */
export const INDEX_LINE_ORDER: readonly IndexLineId[] = ["topics", "glossary", "names", "sources", "stories", "calendar", "years"];

export interface IndexLine {
  readonly id: IndexLineId;
  readonly label: string;
  readonly href: string;
  readonly note: string;
  /** Count from the layer (corpus indexes only; null for the calendar and years). */
  readonly count: string | null;
  /** Extra links on the line (calendar: by parsha, by zman). */
  readonly sub: readonly { readonly label: string; readonly href: string }[];
  /** Built from the corpus layer (AI-generated, unreviewed). */
  readonly generated: boolean;
}

const CORPUS_LINES: Readonly<
  Record<Exclude<IndexLineId, "calendar" | "years">, { index: IndexName; label: CorpusLabelKey; note: CorpusKey; count: CorpusKey; of: keyof LayerIndexCounts }>
> = {
  topics: { index: "topics", label: "index.topics", note: "indexes.topics.note", count: "count.topics", of: "topics" },
  glossary: { index: "glossary", label: "index.glossary", note: "indexes.glossary.note", count: "count.entries", of: "glossary" },
  names: { index: "people", label: "index.names", note: "indexes.names.note", count: "count.names", of: "names" },
  sources: { index: "sources", label: "index.sources", note: "indexes.sources.note", count: "count.works", of: "sources" },
  stories: { index: "stories", label: "index.stories", note: "indexes.stories.note", count: "count.stories", of: "stories" },
};

/** The index page a line links to (root-relative, with a trailing slash). */
export function indexLineHref(ed: Ed, id: IndexLineId): string {
  if (id === "calendar") return `${formatQuiet({ kind: "home", ed })}calendar/`;
  if (id === "years") return formatQuiet({ kind: "index", ed, index: "years" });
  return formatQuiet({ kind: "index", ed, index: CORPUS_LINES[id].index });
}

/**
 * The lines of the indexes block, with counts from the layer. `built` says whether an index page exists in this build; a line whose page is not built is left out, so
 * the title page never links to a page that is not there.
 */
export function indexesBlock(ed: Ed, counts: LayerIndexCounts, built: (href: string) => boolean = () => true): IndexLine[] {
  const t = useCorpusT(ed);
  const out: IndexLine[] = [];
  for (const id of INDEX_LINE_ORDER) {
    const href = indexLineHref(ed, id);
    if (!built(href)) continue;
    if (id === "calendar") {
      out.push({
        id,
        label: t("indexes.calendar"),
        href,
        note: "",
        count: null,
        sub: [
          { label: t("indexes.calendar.parsha"), href: formatQuiet({ kind: "index", ed, index: "calendar-parsha" }) },
          { label: t("indexes.calendar.zman"), href: formatQuiet({ kind: "index", ed, index: "calendar-zman" }) },
        ],
        generated: false,
      });
      continue;
    }
    if (id === "years") {
      out.push({ id, label: t("indexes.years"), href, note: t("indexes.years.note"), count: null, sub: [], generated: false });
      continue;
    }
    const line = CORPUS_LINES[id];
    out.push({
      id,
      label: corpusLabel(line.label, ed),
      href,
      note: t(line.note),
      count: t(line.count, { count: counts[line.of] }),
      sub: [],
      generated: true,
    });
  }
  return out;
}
