/**
 * What the catalog pages show (W3.1; concept-quiet §5.1–5.3, tech-quiet §2, §4), computed from the
 * `.corpus/` files that `buildCorpusWithAggregates` writes. Pure: no Node imports, no I/O, so the
 * same functions run in the pages and in the tests.
 *
 * Only catalog fields and the published one-line summary of shiurim with notes are read. Rows of
 * catalog-only shiurim carry no AI text at all. Generated text is picked per edition with its own
 * language (`PickedText`, ../../lib/content.ts): the Hebrew edition shows a Hebrew translation where
 * one exists, else the Yiddish, else the English.
 */
import { calendar as defaultCalendar, type Calendar } from "@emunas/calendar";
import type { OccasionShiurRef, ParshaOccasion, SeriesEntry, ZmanOccasion } from "@emunas/corpus/aggregate";
import type { CatalogGap, CatalogSource, IndexRow, IndexSection } from "@emunas/corpus/public";
import { SOURCE_LANGS, UI_DIR, hebrewNumeral, hebrewYearParts, pickLocalized, pickText, type AudioLang, type LocalizedText, type PickedText } from "@emunas/i18n";
import { formatQuiet } from "@emunas/links";
import { LANG_SCRIPT } from "@emunas/tokens";
import { shownText } from "../../lib/content.ts";
import type { Ed } from "../../lib/edition.ts";
import type { CatalogCorpus } from "./corpus.ts";

// ------------------------------------------------------------------ addresses

const GUIDE: CatalogSource = "pocket-guide-2012";
/** Prefix of the slug of a section of the uncatalogued guide (its ids repeat the guide's: `zmanim`). */
export const UNCATALOGUED_SLUG_PREFIX = "unc-";

/**
 * The address segment of a section. Pocket Guide sections keep their id (`/yi/section/zmanim/`);
 * uncatalogued-guide sections, whose ids repeat the guide's, are always prefixed
 * (`/yi/section/unc-zmanim/`), so an address never depends on which other sections exist.
 */
export function sectionSlug(section: Pick<IndexSection, "source" | "id">): string {
  return section.source === GUIDE ? section.id : `${UNCATALOGUED_SLUG_PREFIX}${section.id}`;
}

/** `/{ed}/section/{slug}/` for a section key (`${source}:${id}`) or section. */
export function sectionHref(ed: Ed, section: Pick<IndexSection, "source" | "id">): string {
  return `/${ed}/section/${encodeURIComponent(sectionSlug(section))}/`;
}

export function seriesHref(ed: Ed, id: string): string {
  return formatQuiet({ kind: "series", ed, id });
}

export function shiurHref(ed: Ed, id: string): string {
  return formatQuiet({ kind: "shiur", ed, id });
}

export function contentsHref(ed: Ed): string {
  return formatQuiet({ kind: "index", ed, index: "contents" });
}

// ------------------------------------------------------------------ rows

export interface CatalogRow {
  readonly id: string;
  readonly href: string;
  /** Spoken language of the shiur (decides the script run of its catalog text). */
  readonly lang: AudioLang;
  readonly status: IndexRow["status"];
  readonly title: string;
  readonly heading: string | null;
  readonly subTitle: string | null;
  readonly n: string | null;
  /** Not a printed Pocket Guide row (uncatalogued guide). */
  readonly uncatalogued: boolean;
  readonly derived: IndexRow["catalog"]["derived"];
  readonly parsha: { readonly key: string; readonly raw: string } | null;
  readonly zman: { readonly key: string; readonly raw: string } | null;
  readonly perek: string | null;
  readonly years: readonly number[];
  readonly duration: number;
  /** At least one recording can be played from the media host. */
  readonly playable: boolean;
  /**
   * The one-line summary for the edition (its own language, else the fallback, with the language it
   * is in); only for shiurim with notes (status "full").
   */
  readonly oneLiner: PickedText | null;
  /** A guide row with no recording at all (`index.json` gaps): greyed, no page, no link. */
  readonly gap?: true;
}

export function catalogRow(row: IndexRow, ed: Ed, audio: CatalogCorpus["audio"]): CatalogRow {
  const oneLiner = row.status === "full" ? shownText(row.oneLiner, ed) : null;
  return {
    id: row.id,
    href: shiurHref(ed, row.id),
    lang: row.lang,
    status: row.status,
    title: row.catalog.titleOriginal,
    heading: row.catalog.heading ?? null,
    subTitle: row.catalog.subTitle,
    n: row.catalog.n,
    uncatalogued: row.catalog.source !== GUIDE,
    derived: row.catalog.derived,
    parsha: row.parsha,
    zman: row.zman,
    perek: row.perek,
    years: row.years,
    duration: row.duration,
    playable: row.recordingIds.some((id) => audio[id]?.playable === true),
    oneLiner,
  };
}

/** A catalog gap (a guide row with no audio) as a greyed table row; `href` is unused (no page). */
export function gapRow(g: CatalogGap): CatalogRow {
  return {
    id: g.id,
    href: "",
    lang: g.lang,
    status: "catalog-only",
    title: g.catalog.titleOriginal,
    heading: g.catalog.heading ?? null,
    subTitle: g.catalog.subTitle,
    n: g.catalog.n,
    uncatalogued: g.catalog.source !== GUIDE,
    derived: g.catalog.derived,
    parsha: g.parsha,
    zman: g.zman,
    perek: g.perek,
    years: g.years,
    duration: 0,
    playable: false,
    oneLiner: null,
    gap: true,
  };
}

/** The catalog gaps of a section key, in catalog order. */
export function sectionGaps(corpus: CatalogCorpus, key: string): CatalogGap[] {
  return corpus.index.gaps.filter((g) => g.sectionKey === key);
}

/**
 * The rows of a section with its gaps put where the guide prints them: each gap after the in-scope
 * shiur it follows in catalog order (`after`), or first.
 */
export function withGaps(rows: CatalogRow[], gaps: readonly CatalogGap[]): CatalogRow[] {
  if (gaps.length === 0) return rows;
  const out: CatalogRow[] = gaps.filter((g) => g.after === null).map((g) => gapRow(g));
  const placed = new Set(out.map((r) => r.id));
  for (const r of rows) {
    out.push(r);
    for (const g of gaps) {
      if (g.after === r.id) {
        out.push(gapRow(g));
        placed.add(g.id);
      }
    }
  }
  // A gap whose predecessor is not on this page goes last rather than disappearing.
  for (const g of gaps) if (!placed.has(g.id)) out.push(gapRow(g));
  return out;
}

/** Index rows by id, memoised per corpus object. */
const rowsCache = new WeakMap<CatalogCorpus, Map<string, IndexRow>>();
export function indexRows(corpus: CatalogCorpus): Map<string, IndexRow> {
  let m = rowsCache.get(corpus);
  if (!m) {
    m = new Map(corpus.index.shiurim.map((r) => [r.id, r]));
    rowsCache.set(corpus, m);
  }
  return m;
}

function rowsOf(corpus: CatalogCorpus, ids: readonly string[], ed: Ed): CatalogRow[] {
  const all = indexRows(corpus);
  const out: CatalogRow[] = [];
  for (const id of ids) {
    const r = all.get(id);
    if (r) out.push(catalogRow(r, ed, corpus.audio));
  }
  return out;
}

// ------------------------------------------------------------------ sections and contents

export interface SectionSummary {
  readonly key: string;
  readonly source: CatalogSource;
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  /** Script direction of the printed section title. */
  readonly dir: "rtl" | "ltr";
  /** Language of most of its shiurim. */
  readonly lang: AudioLang;
  readonly count: number;
  readonly pages: readonly [number, number] | null;
  readonly order: number;
  readonly uncatalogued: boolean;
  readonly shiurIds: readonly string[];
}

/**
 * Every section with at least one in-scope shiur or catalog gap (a guide row with no audio), in
 * catalog order (guide, then uncatalogued guide). `count` is the in-scope shiurim only.
 */
export function sectionSummaries(corpus: CatalogCorpus): SectionSummary[] {
  const meta = new Map(corpus.index.sections.map((s) => [s.key, s]));
  const rows = indexRows(corpus);
  const gapSections = new Set((corpus.index.gaps ?? []).map((g) => g.sectionKey));
  return corpus.sections.sections
    .filter((s) => s.count > 0 || gapSections.has(s.key))
    .map((s) => {
      const m = meta.get(s.key);
      const source = (m?.source ?? s.source) as CatalogSource;
      // A section of gaps only takes its language from them.
      const langs = s.count > 0 ? s.shiurIds.map((id) => rows.get(id)?.lang) : sectionGaps(corpus, s.key).map((g) => g.lang);
      const yi = langs.filter((l) => l === "yi").length;
      const en = langs.length - yi;
      const dir = m?.dir ?? (/[֐-׿]/.test(s.title) ? "rtl" : "ltr");
      const lang: AudioLang = yi > en ? "yi" : en > yi ? "en" : dir === "rtl" ? "yi" : "en";
      return {
        key: s.key,
        source,
        id: s.id,
        slug: sectionSlug({ source, id: s.id }),
        title: s.title,
        dir,
        lang,
        count: s.count,
        pages: m?.pages ?? null,
        order: s.order,
        uncatalogued: source !== GUIDE,
        shiurIds: s.shiurIds,
      };
    })
    .sort((a, b) => a.order - b.order);
}

export interface SeriesSummary {
  readonly id: string;
  readonly href: string;
  /** Title for the edition (its own language, else the fallback). */
  readonly title: string;
  /** `lang`/`dir` of `title` as shown. */
  readonly titleLang: PickedText["lang"];
  readonly titleDir: PickedText["dir"];
  /** Spoken language of the series. */
  readonly lang: AudioLang;
  readonly count: number;
}

export function seriesSummaries(corpus: CatalogCorpus, ed: Ed): SeriesSummary[] {
  return corpus.series.series
    .filter((s) => s.parts.length > 0)
    .map((s) => {
      const title = pickText(s.title, ed);
      return { id: s.id, href: seriesHref(ed, s.id), title: title.text, titleLang: title.lang, titleDir: title.dir, lang: s.lang, count: s.parts.length };
    });
}

export interface ContentsModel {
  /** Pocket Guide sections of Yiddish shiurim, guide order. */
  readonly yiddish: SectionSummary[];
  /** Pocket Guide sections of English shiurim, guide order. */
  readonly english: SectionSummary[];
  /** Uncatalogued-guide sections, in that file's order. */
  readonly uncatalogued: SectionSummary[];
  /** Series by the language they are spoken in. */
  readonly series: Readonly<Record<AudioLang, SeriesSummary[]>>;
}

/** The contents (concept-quiet §5.2): guide order, Yiddish then English, then the uncatalogued sections. */
export function contentsModel(corpus: CatalogCorpus, ed: Ed): ContentsModel {
  const all = sectionSummaries(corpus);
  const guide = all.filter((s) => !s.uncatalogued);
  const series = seriesSummaries(corpus, ed);
  return {
    yiddish: guide.filter((s) => s.lang === "yi"),
    english: guide.filter((s) => s.lang === "en"),
    uncatalogued: all.filter((s) => s.uncatalogued),
    series: { yi: series.filter((s) => s.lang === "yi"), en: series.filter((s) => s.lang === "en") },
  };
}

// ------------------------------------------------------------------ a section page

export interface RowGroup {
  /** Anchor id on the page (`p-noach`, `z-chanukah`, `other`). */
  readonly id: string;
  readonly label: string;
  /** Language of `label` when it is catalog text rather than UI text. */
  readonly labelLang?: Ed;
  readonly rows: CatalogRow[];
}

export interface ChumashGroup {
  readonly id: string;
  /** Key of the chumash (`bereishis`…), for the UI label. */
  readonly chumash: string;
  readonly parshiyos: RowGroup[];
}

export type SectionLayout =
  | { readonly kind: "flat"; readonly rows: CatalogRow[] }
  | { readonly kind: "parsha"; readonly chumashim: ChumashGroup[]; readonly other: RowGroup | null }
  | { readonly kind: "zman"; readonly zmanim: RowGroup[]; readonly other: RowGroup | null };

export interface SectionModel {
  readonly section: SectionSummary;
  readonly rows: CatalogRow[];
  readonly layout: SectionLayout;
  /** Series that are made of this section's shiurim. */
  readonly series: SeriesSummary[];
  readonly anyNotes: boolean;
}

/** A section is sub-grouped when it is large and nearly all its rows carry the key (parsha, zman). */
export const GROUP_MIN_ROWS = 12;
const GROUP_SHARE = 0.9;

/** An occasion's name in the edition's language (occasions carry a name in every language). */
function occasionLabel(o: Readonly<Record<Ed, string>>, ed: Ed): string {
  return o[ed];
}

function parshaLayout(rows: CatalogRow[], parshiyos: readonly ParshaOccasion[], ed: Ed): SectionLayout {
  const byKey = new Map(parshiyos.map((p) => [p.key, p]));
  const groups = new Map<string, CatalogRow[]>();
  const other: CatalogRow[] = [];
  for (const r of rows) {
    const p = r.parsha ? byKey.get(r.parsha.key) : undefined;
    if (!p) {
      other.push(r);
      continue;
    }
    const list = groups.get(p.key) ?? [];
    list.push(r);
    groups.set(p.key, list);
  }
  const chumashim: ChumashGroup[] = [];
  for (const p of [...parshiyos].sort((a, b) => a.order - b.order)) {
    const list = groups.get(p.key);
    if (!list) continue;
    let c = chumashim.find((x) => x.chumash === p.chumash);
    if (!c) {
      c = { id: `c-${p.chumash}`, chumash: p.chumash, parshiyos: [] };
      chumashim.push(c);
    }
    c.parshiyos.push({ id: `p-${p.key}`, label: occasionLabel(p, ed), rows: list });
  }
  return { kind: "parsha", chumashim, other: other.length ? { id: "other", label: "", rows: other } : null };
}

function zmanLayout(rows: CatalogRow[], zmanim: readonly ZmanOccasion[], ed: Ed): SectionLayout {
  const byKey = new Map(zmanim.map((z) => [z.key, z]));
  const groups = new Map<string, CatalogRow[]>();
  const other: CatalogRow[] = [];
  for (const r of rows) {
    const z = r.zman ? byKey.get(r.zman.key) : undefined;
    if (!z) {
      other.push(r);
      continue;
    }
    const list = groups.get(z.key) ?? [];
    list.push(r);
    groups.set(z.key, list);
  }
  const out: RowGroup[] = [];
  for (const z of [...zmanim].sort((a, b) => a.order - b.order)) {
    const list = groups.get(z.key);
    if (list) out.push({ id: `z-${z.key}`, label: occasionLabel(z, ed), rows: list });
  }
  return { kind: "zman", zmanim: out, other: other.length ? { id: "other", label: "", rows: other } : null };
}

/** How a section's rows are laid out: by chumash and parsha, by zman in the order of the year, or flat. */
export function sectionLayout(rows: CatalogRow[], corpus: CatalogCorpus, ed: Ed): SectionLayout {
  if (rows.length >= GROUP_MIN_ROWS) {
    const withParsha = rows.filter((r) => r.parsha !== null).length;
    const withZman = rows.filter((r) => r.zman !== null).length;
    if (withParsha >= rows.length * GROUP_SHARE && withParsha >= withZman) {
      return parshaLayout(rows, corpus.occasions.parshiyos, ed);
    }
    if (withZman >= rows.length * GROUP_SHARE) return zmanLayout(rows, corpus.occasions.zmanim, ed);
  }
  return { kind: "flat", rows };
}

export function sectionModel(corpus: CatalogCorpus, slug: string, ed: Ed): SectionModel | null {
  const section = sectionSummaries(corpus).find((s) => s.slug === slug);
  if (!section) return null;
  const rows = withGaps(rowsOf(corpus, section.shiurIds, ed), sectionGaps(corpus, section.key));
  const ids = new Set(section.shiurIds);
  const series = seriesSummaries(corpus, ed).filter((s) => {
    const entry = corpus.series.series.find((x) => x.id === s.id);
    return entry !== undefined && entry.parts.some((p) => ids.has(p.id));
  });
  return { section, rows, layout: sectionLayout(rows, corpus, ed), series, anyNotes: rows.some((r) => r.oneLiner !== null) };
}

// ------------------------------------------------------------------ a series page

export interface SeriesRow extends CatalogRow {
  /** 1-based position in the series. */
  readonly part: number;
  /**
   * With a series introduction: this part is not visible (no notes yet), so it has no arc line and
   * its row says "notes not prepared yet" (Quiet C4.7). Always false without an introduction.
   */
  readonly notPrepared: boolean;
}

export interface PerekGroup {
  readonly id: string;
  readonly perek: string | null;
  readonly rows: SeriesRow[];
}

/**
 * The generated series introduction (Quiet C4.7, `.corpus/layer/series/<id>.json`), in the
 * edition's language. AI wording: it sits inside the notes area, under the notes label, and the
 * catalog name stays the page title.
 */
export interface SeriesIntro {
  /** The generated title, shown as a subtitle (null when blank). */
  readonly subtitle: PickedText | null;
  /** Null when blank (for example a field blanked by the verbatim scan). */
  readonly overview: PickedText | null;
  /** Plain text, never links. */
  readonly keyThemes: readonly PickedText[];
  readonly reviewed: boolean;
}

export interface SeriesModel {
  readonly entry: SeriesEntry;
  /** The catalog title for the edition (its own language, else the fallback). */
  readonly title: PickedText;
  /** The catalog title in the other source language, when it differs (for the subtitle). */
  readonly otherTitle: PickedText | null;
  readonly count: number;
  readonly rows: SeriesRow[];
  /** Tanya: consecutive runs of the same perek, in series order; null when the parts carry no perek. */
  readonly groups: PerekGroup[] | null;
  /** The catalog sections the set was printed in. */
  readonly sections: SectionSummary[];
  readonly anyNotes: boolean;
  /** The generated introduction; null for a series with no synthesis or no visible part (no synthesis UI). */
  readonly intro: SeriesIntro | null;
}

/** A generated text per language, read defensively (a `LocalizedText` when well formed). */
type Texts = { readonly [L in Ed]?: unknown } | null | undefined;

/**
 * The parts of a layer series synthesis (`LayerSeries`) the page reads. Typed loosely: the
 * pipeline's shapes keep changing, so every field is read defensively.
 */
export interface SeriesSynthesis {
  readonly title?: Texts;
  readonly overview?: Texts;
  readonly keyThemes?: readonly Texts[] | null;
  readonly arc?: readonly { readonly shiurId?: unknown; readonly oneLiner?: Texts }[] | null;
  readonly reviewed?: boolean;
}

/** The text to show in `ed` along `CONTENT_FALLBACK`, trimmed; null when no language has one. */
function textIn(t: Texts, ed: Ed): PickedText | null {
  const picked = pickLocalized<unknown>(t, ed, (v) => typeof v === "string" && v.trim() !== "");
  return picked && typeof picked.value === "string"
    ? { text: picked.value.trim(), lang: picked.lang, dir: picked.dir, fallback: picked.fallback }
    : null;
}

/**
 * A series page. With `synthesis` (the layer's series file) naming at least one part of the set,
 * the page gains the introduction, each visible part's line becomes its arc one-liner, and the
 * parts without an arc line (not visible: no notes yet) keep their row and number, marked "notes
 * not prepared yet". Without a synthesis the page is the plain catalog list, with no intro.
 */
export function seriesModel(corpus: CatalogCorpus, id: string, ed: Ed, synthesis: SeriesSynthesis | null = null): SeriesModel | null {
  const entry = corpus.series.series.find((s) => s.id === id);
  if (!entry || entry.parts.length === 0) return null;
  const count = entry.parts.length;
  const position = new Map(entry.parts.map((p, i) => [p.id, i + 1]));
  const arcLine = new Map<string, PickedText | null>();
  for (const a of Array.isArray(synthesis?.arc) ? synthesis.arc : []) {
    if (typeof a?.shiurId === "string" && position.has(a.shiurId) && !arcLine.has(a.shiurId)) {
      arcLine.set(a.shiurId, textIn(a.oneLiner, ed));
    }
  }
  // A synthesis that names no part of this set (no visible part): no synthesis UI at all.
  const withIntro = synthesis !== null && arcLine.size > 0;
  const rows: SeriesRow[] = rowsOf(
    corpus,
    entry.parts.map((p) => p.id),
    ed,
  ).map((r) => {
    const part = position.get(r.id) ?? 0;
    if (!withIntro) return { ...r, part, notPrepared: false };
    if (!arcLine.has(r.id)) return { ...r, part, oneLiner: null, notPrepared: true };
    // A visible part whose arc line is blank keeps its own one-line summary.
    return { ...r, part, oneLiner: arcLine.get(r.id) ?? r.oneLiner, notPrepared: false };
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = entry.groups
    ? entry.groups
        .map((g, i) => ({
          id: `perek-${i + 1}`,
          perek: g.perek,
          rows: g.shiurIds.map((x) => byId.get(x)).filter((r): r is SeriesRow => r !== undefined),
        }))
        .filter((g) => g.rows.length > 0)
    : null;
  const partIds = new Set(entry.parts.map((p) => p.id));
  const sections = sectionSummaries(corpus).filter((s) => s.shiurIds.some((x) => partIds.has(x)));
  const title = pickText(entry.title, ed);
  const intro: SeriesIntro | null =
    withIntro && synthesis !== null
      ? {
          subtitle: textIn(synthesis.title, ed),
          overview: textIn(synthesis.overview, ed),
          keyThemes: (Array.isArray(synthesis.keyThemes) ? synthesis.keyThemes : [])
            .map((k) => textIn(k, ed))
            .filter((k): k is PickedText => k !== null),
          reviewed: synthesis.reviewed === true,
        }
      : null;
  return {
    entry,
    title,
    otherTitle: otherSourceTitle(entry.title, title),
    count,
    rows,
    groups,
    sections,
    anyNotes: rows.some((r) => r.oneLiner !== null || r.notPrepared),
    intro,
  };
}

/**
 * The catalog title in the first source language (en, yi) other than the one shown, when its text
 * differs: the subtitle of a series page (an English page shows the Yiddish title, and the
 * Yiddish and Hebrew pages the English).
 */
function otherSourceTitle(title: LocalizedText, shown: PickedText): PickedText | null {
  for (const lang of SOURCE_LANGS) {
    if (lang === shown.lang) continue;
    const text = title[lang].trim();
    if (text !== "" && text !== shown.text.trim()) return { text, lang, dir: UI_DIR[lang], fallback: true };
  }
  return null;
}

/**
 * A perek heading as printed in the catalog: a Hebrew numeral (`א`, `יב`, `א-ב`) reads "פרק א" /
 * "Perek א"; a word (`הקדמה`) stands alone.
 */
export function perekIsNumeral(perek: string): boolean {
  const parts = perek
    .replace(/["'׳״‘’“”]/g, "")
    .split(/[-–־,\s]+/)
    .filter(Boolean)
    // "י"א וי"ב": a joining vav before the second numeral
    .map((p, i) => (i > 0 && p.length > 1 && p.startsWith("ו") ? p.slice(1) : p));
  return parts.length > 0 && parts.every((p) => /^[א-ת]{1,3}$/.test(p) || /^\d+$/.test(p));
}

// ------------------------------------------------------------------ the title page

export interface OccasionPick {
  readonly kind: "parsha" | "zman";
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** All shiurim of the occasion (both languages, by year). */
  readonly count: number;
  /** The first few, titles only. */
  readonly rows: CatalogRow[];
  /** The zman window is open on the build date. */
  readonly active: boolean;
}

export interface ThisWeekModel {
  /** `YYYY-MM-DD` the page was computed for. */
  readonly date: string;
  /** The Hebrew date of `date` in the edition (`5 Kislev 5787` / `ה' כסלו תשפ"ז`), or null past the table. */
  readonly hebrewDate: string | null;
  readonly parsha: OccasionPick | null;
  readonly zman: OccasionPick | null;
}

/** How many shiur titles the title page lists per occasion. */
export const THIS_WEEK_LIMIT = 5;
/** How far ahead the title page looks for the nearest zman that has shiurim. */
export const ZMAN_LOOKAHEAD_DAYS = 45;

function pick(
  corpus: CatalogCorpus,
  ed: Ed,
  kind: "parsha" | "zman",
  o: { readonly key: string } & Readonly<Record<Ed, string>>,
  refs: readonly OccasionShiurRef[],
  active: boolean,
): OccasionPick {
  return {
    kind,
    key: o.key,
    label: occasionLabel(o, ed),
    href: formatQuiet({ kind: "occasion", ed, key: o.key, occasion: kind }),
    count: refs.length,
    rows: rowsOf(
      corpus,
      refs.slice(0, THIS_WEEK_LIMIT).map((r) => r.id),
      ed,
    ),
    active,
  };
}

/** The time zone whose civil day is the build date (the listeners are mostly in New York). */
export const BUILD_TIME_ZONE = "America/New_York";

const buildDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUILD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The build date: `EMUNAS_BUILD_DATE` (YYYY-MM-DD) when set, else today in {@link BUILD_TIME_ZONE}. */
export function buildDate(env: Record<string, string | undefined> = {}, now: Date = new Date()): string {
  const fixed = env["EMUNAS_BUILD_DATE"];
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) return fixed;
  const parts = buildDayFormat.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** `YYYY-MM-DD` plus `days` civil days. */
export function addIsoDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * "This week" on the title page (concept-quiet §5.1) for one day: the parsha of the week and the
 * nearest zman that has shiurim in the collection.
 */
export function thisWeekModel(corpus: CatalogCorpus, ed: Ed, date: string, cal: Calendar = defaultCalendar): ThisWeekModel {
  const week = cal.thisWeek(date, { lookaheadDays: ZMAN_LOOKAHEAD_DAYS });
  let parsha: OccasionPick | null = null;
  if (week?.parshaKey) {
    const byKey = new Map(corpus.occasions.parshiyos.map((p) => [p.key, p]));
    // A combined parsha: its own shiurim, else those of its parts.
    const main = byKey.get(week.parshaKey);
    const refs = main?.shiurim.length
      ? main.shiurim
      : week.parshaKeys.slice(1).flatMap((k) => byKey.get(k)?.shiurim ?? []);
    if (main) parsha = pick(corpus, ed, "parsha", main, refs, true);
  }
  let zman: OccasionPick | null = null;
  if (week) {
    const byKey = new Map(corpus.occasions.zmanim.map((z) => [z.key, z]));
    for (const hit of week.upcomingOccasions) {
      const z = byKey.get(hit.key);
      if (!z || z.count === 0) continue;
      zman = pick(corpus, ed, "zman", z, [...z.shiurim, ...z.subs.flatMap((s) => s.shiurim)], hit.active);
      break;
    }
  }
  return { date, hebrewDate: hebrewDateLabel(cal, date, ed), parsha, zman };
}

/** One occasion block on the title page; a zman that is on now and one that is coming differ in heading. */
export type WeekBlockKey = `parsha:${string}` | `zman:${string}:${"now" | "soon"}`;

export function weekBlockKey(p: OccasionPick): WeekBlockKey {
  return p.kind === "parsha" ? `parsha:${p.key}` : `zman:${p.key}:${p.active ? "now" : "soon"}`;
}

export interface ThisWeekDay {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  /** As in {@link ThisWeekModel}. */
  readonly hebrewDate: string | null;
  /** Parsha first, then zman; empty when there is nothing to show. */
  readonly blocks: readonly WeekBlockKey[];
}

export interface ThisWeekWindow {
  /** The build day: what the page shows without script. */
  readonly today: ThisWeekDay;
  /** {@link WEEK_DAYS_BEFORE} days before the build day to {@link WEEK_DAYS_AFTER} after it, in order. */
  readonly days: readonly ThisWeekDay[];
  /** Every block a day in the window refers to, rendered once each. */
  readonly blocks: ReadonlyMap<WeekBlockKey, OccasionPick>;
}

/**
 * The days around the build day that the title page carries, so a small script can show the
 * visitor's own day: one behind (visitors west of New York before their midnight) and three ahead,
 * which covers the two days between scheduled rebuilds with a day to spare.
 */
export const WEEK_DAYS_BEFORE = 1;
export const WEEK_DAYS_AFTER = 3;

/** "This week" for every day of the window around `date`, with each occasion block once. */
export function thisWeekWindow(corpus: CatalogCorpus, ed: Ed, date: string, cal: Calendar = defaultCalendar): ThisWeekWindow {
  const blocks = new Map<WeekBlockKey, OccasionPick>();
  const days: ThisWeekDay[] = [];
  for (let i = -WEEK_DAYS_BEFORE; i <= WEEK_DAYS_AFTER; i++) {
    const m = thisWeekModel(corpus, ed, addIsoDays(date, i), cal);
    const keys: WeekBlockKey[] = [];
    for (const p of [m.parsha, m.zman]) {
      if (p === null) continue;
      const key = weekBlockKey(p);
      if (!blocks.has(key)) blocks.set(key, p);
      keys.push(key);
    }
    days.push({ date: m.date, hebrewDate: m.hebrewDate, blocks: keys });
  }
  const today = days[WEEK_DAYS_BEFORE]!;
  return { today, days, blocks };
}

export function hebrewDateLabel(cal: Calendar, date: string, ed: Ed): string | null {
  const h = cal.hebrewDate(date);
  if (!h) return null;
  if (LANG_SCRIPT[ed] === "latin") return `${h.day} ${h.monthName} ${h.year}`;
  const year = hebrewYearParts(h.year)?.hebrew ?? String(h.year);
  return `${hebrewNumeral(h.day)} ${h.monthNameHe} ${year}`;
}

export interface CorpusTotals {
  readonly total: number;
  readonly full: number;
  /** Total hours, rounded to the nearest ten ("about 770 hours"). */
  readonly hoursAbout: number;
}

export function corpusTotals(corpus: CatalogCorpus): CorpusTotals {
  const seconds = corpus.index.shiurim.reduce((a, r) => a + (Number.isFinite(r.duration) ? r.duration : 0), 0);
  return {
    total: corpus.build.counts.total,
    full: corpus.build.counts.full,
    hoursAbout: Math.round(seconds / 36000) * 10,
  };
}

/** The 2012 Pocket Guide as a PDF at the root of the media host. */
export function pocketGuideUrl(corpus: { readonly build: { readonly mediaOrigin: string } }): string {
  return `${corpus.build.mediaOrigin}/pocket-guide-2012.pdf`;
}
