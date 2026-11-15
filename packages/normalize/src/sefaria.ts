/**
 * Sefaria ref parser: "Genesis 12:6", "Shabbat 21b", "Rashi on Genesis 1:1:1",
 * "Mishneh Torah, Kings and Wars 12:1", "Mishnah Avot 3:1", "Jerusalem Talmud Yoma 1:1",
 * "Shulchan Arukh, Orach Chayim 1:1", "Midrash Tanchuma, Nasso 3", "Onkelos Genesis 1:1",
 * ranges "Exodus 31:16-17", "Berakhot 2a-3b". Pure, never throws.
 *
 * A parsed ref carries the base book (corpus, Sefaria title, he/en name), an optional
 * commentator, the work keys (`workKey` = commentator's work when there is one, `baseWorkKey` =
 * the book's), start/end points and a numeric `sortKey` for traditional order (Torah → Nevi'im →
 * Kesuvim, Mishnah, Bavli in Shas order, …; then chapter/verse or daf/amud).
 * Anything that cannot be parsed comes back as `{ ok: false, reason }` (classified, not thrown).
 */
import { foldBasic } from "./fold.ts";
import { toHebrewNumeral } from "./gematria.ts";
import { lookupParsha } from "./occasion.ts";
import { MISHNEH_TORAH_HILCHOS, SEFER_HAMITZVOT_PARTS, SHULCHAN_ARUKH_PARTS, type RefSection } from "./tables/ref-sections.ts";
import { TANACH } from "./tables/tanach.ts";
import { TRACTATES } from "./tables/tractates.ts";
import { WORKS } from "./tables/works.ts";
import { lookupWork } from "./work.ts";

export type RefCorpus =
  | "tanach"
  | "mishnah"
  | "bavli"
  | "yerushalmi"
  | "midrash"
  | "mishneh-torah"
  | "sefer-hamitzvos"
  | "shulchan-aruch"
  | "other";

export type RefPoint =
  /** chapter[:verse[:sub]] — also mishnah (perek:mishnah), Yerushalmi (perek:halacha), MT (perek:halacha), SA (siman:se'if) */
  | { kind: "chapter"; chapter: number; verse: number | null; sub: number | null }
  /** daf + amud [:line] */
  | { kind: "daf"; daf: number; amud: "a" | "b"; line: number | null };

export interface ParsedRef {
  ok: true;
  ref: string;
  corpus: RefCorpus;
  /** canonical Sefaria title of the base book, e.g. "Genesis", "Shabbat", "Mishneh Torah" */
  book: string;
  /** named section inside the book ("Kings and Wars", "Orach Chayim", "Nasso"), else null */
  section: string | null;
  sectionHe: string | null;
  /** commentator as written in the ref ("Rashi", "Onkelos"), else null */
  commentator: string | null;
  /** work the mention belongs to: the commentator's when there is one */
  workKey: string;
  /** work of the base book */
  baseWorkKey: string;
  he: string;
  en: string;
  start: RefPoint | null;
  end: RefPoint | null;
  sortKey: readonly number[];
}

export interface UnparsedRef {
  ok: false;
  ref: string;
  reason: "empty" | "unknown-title" | "bad-location";
  title: string | null;
}

export type RefParse = ParsedRef | UnparsedRef;

// ---------------- registry ----------------

interface BookEntry {
  title: string;
  corpus: RefCorpus;
  workKey: string;
  he: string;
  en: string;
  order: number;
}

interface SectionedEntry extends BookEntry {
  sections: (s: string) => { name: string; he: string | null; order: number };
}

const CORPUS_BASE: Readonly<Record<RefCorpus, number>> = {
  tanach: 1000,
  mishnah: 2000,
  bavli: 3000,
  yerushalmi: 4000,
  midrash: 5000,
  "mishneh-torah": 6000,
  "sefer-hamitzvos": 6500,
  "shulchan-aruch": 7000,
  other: 8000,
};

let books: Map<string, BookEntry> | null = null;
let sectioned: Map<string, SectionedEntry> | null = null;

function add(m: Map<string, BookEntry>, names: readonly string[], e: BookEntry): void {
  for (const n of names) {
    const f = foldBasic(n);
    if (f.length > 0 && !m.has(f)) m.set(f, e);
  }
}

function sectionLookup(list: readonly RefSection[]): SectionedEntry["sections"] {
  const idx = new Map<string, { name: string; he: string; order: number }>();
  list.forEach((s, i) => {
    for (const n of [s.en, ...(s.aliases ?? [])]) idx.set(foldBasic(n), { name: s.en, he: s.he, order: i + 1 });
  });
  return (s) => idx.get(foldBasic(s)) ?? { name: s, he: null, order: 999 };
}

function registry(): { books: Map<string, BookEntry>; sectioned: Map<string, SectionedEntry> } {
  if (books && sectioned) return { books, sectioned };
  const m = new Map<string, BookEntry>();
  for (const b of TANACH) {
    add(m, [b.sefaria, b.en, ...b.aliases], {
      title: b.sefaria, corpus: "tanach", workKey: b.work, he: b.he, en: b.en, order: CORPUS_BASE.tanach + b.order,
    });
  }
  for (const t of TRACTATES) {
    const names = [t.sefaria, t.en, ...t.aliases];
    const isAvos = t.id === "avos";
    const mishnah: BookEntry = {
      title: isAvos ? "Pirkei Avot" : `Mishnah ${t.sefaria}`,
      corpus: "mishnah",
      workKey: isAvos ? "pirkei-avos" : `mishnah-${t.id}`,
      he: isAvos ? "פרקי אבות" : `משנה ${t.he}`,
      en: isAvos ? "Pirkei Avos" : `Mishnah ${t.en}`,
      order: CORPUS_BASE.mishnah + t.order,
    };
    add(m, names.map((n) => `Mishnah ${n}`), mishnah);
    if (isAvos) add(m, names, mishnah);
    if (t.bavli) {
      add(m, names, {
        title: t.sefaria, corpus: "bavli", workKey: `bavli-${t.id}`, he: t.he, en: t.en, order: CORPUS_BASE.bavli + t.order,
      });
    }
    if (t.yerushalmi) {
      add(m, names.flatMap((n) => [`Jerusalem Talmud ${n}`, `Yerushalmi ${n}`, `Talmud Yerushalmi ${n}`]), {
        title: `Jerusalem Talmud ${t.sefaria}`, corpus: "yerushalmi", workKey: `yerushalmi-${t.id}`,
        he: `ירושלמי ${t.he}`, en: `Yerushalmi ${t.en}`, order: CORPUS_BASE.yerushalmi + t.order,
      });
    }
  }
  // bare names of Mishnah-only tractates ("Middot 1:3") read as Mishnah
  for (const t of TRACTATES) {
    if (t.bavli) continue;
    const e = m.get(foldBasic(`Mishnah ${t.sefaria}`));
    if (e) add(m, [t.sefaria, t.en, ...t.aliases], e);
  }
  const SKIP = new Set(["mishneh-torah", "sefer-hamitzvos", "shulchan-aruch", "midrash-tanchuma", "targum-onkelos", "ohr-hachaim"]);
  for (const w of WORKS) {
    if (w.sefaria.length === 0 || SKIP.has(w.key)) continue;
    if (w.group === "torah" || w.group === "neviim" || w.group === "kesuvim" || w.group === "mishnah" || w.group === "bavli" || w.group === "yerushalmi") continue;
    const corpus: RefCorpus = w.group === "midrash" ? "midrash" : "other";
    add(m, [...w.sefaria, ...w.aliases], {
      title: w.sefaria[0] as string, corpus, workKey: w.key, he: w.he, en: w.en, order: CORPUS_BASE[corpus] + w.order,
    });
  }

  const s = new Map<string, SectionedEntry>();
  const addS = (names: string[], e: SectionedEntry): void => {
    for (const n of names) s.set(foldBasic(n), e);
  };
  addS(["Mishneh Torah", "Rambam", "Rambam, Mishneh Torah"], {
    title: "Mishneh Torah", corpus: "mishneh-torah", workKey: "mishneh-torah", he: "משנה תורה", en: "Mishneh Torah",
    order: CORPUS_BASE["mishneh-torah"], sections: sectionLookup(MISHNEH_TORAH_HILCHOS),
  });
  addS(["Shulchan Arukh", "Shulchan Aruch"], {
    title: "Shulchan Arukh", corpus: "shulchan-aruch", workKey: "shulchan-aruch", he: "שולחן ערוך", en: "Shulchan Aruch",
    order: CORPUS_BASE["shulchan-aruch"], sections: sectionLookup(SHULCHAN_ARUKH_PARTS),
  });
  addS(["Sefer HaMitzvot", "Sefer HaMitzvos"], {
    title: "Sefer HaMitzvot", corpus: "sefer-hamitzvos", workKey: "sefer-hamitzvos", he: "ספר המצוות", en: "Sefer HaMitzvos",
    order: CORPUS_BASE["sefer-hamitzvos"], sections: sectionLookup(SEFER_HAMITZVOT_PARTS),
  });
  addS(["Midrash Tanchuma", "Tanchuma"], {
    title: "Midrash Tanchuma", corpus: "midrash", workKey: "midrash-tanchuma", he: "מדרש תנחומא", en: "Midrash Tanchuma",
    order: CORPUS_BASE.midrash + 20,
    sections: (name) => {
      const p = lookupParsha(name);
      return p.parsha ? { name, he: p.parsha.he, order: p.parsha.order } : { name, he: null, order: 999 };
    },
  });
  books = m;
  sectioned = s;
  return { books: m, sectioned: s };
}

// ---------------- title resolution ----------------

interface Resolved {
  entry: BookEntry;
  section: { name: string; he: string | null; order: number } | null;
  commentator: string | null;
}

function resolveTitle(title: string, depth = 0): Resolved | null {
  const { books: m, sectioned: s } = registry();
  const f = foldBasic(title);
  const direct = m.get(f);
  if (direct) return { entry: direct, section: null, commentator: null };

  const comma = /^(.+?),\s*(.+)$/.exec(title);
  if (comma) {
    const book = s.get(foldBasic(comma[1] as string));
    if (book) return { entry: book, section: book.sections(comma[2] as string), commentator: null };
  }
  if (depth > 0) return null;

  const onkelos = /^(Onkelos|Targum Onkelos)\s+(.+)$/i.exec(title);
  if (onkelos) {
    const base = resolveTitle(onkelos[2] as string, depth + 1);
    if (base) return { ...base, commentator: "Onkelos" };
  }
  const on = /^(.+?)\s+on\s+(.+)$/.exec(title);
  if (on) {
    const base = resolveTitle(on[2] as string, depth + 1);
    if (base) return { ...base, commentator: (on[1] as string).trim() };
  }
  return null;
}

// ---------------- location ----------------

const LOC = /^(\d+[ab]?(?:[:.]\d+)*)(?:\s*[-\u2013]\s*(\d+[ab]?(?:[:.]\d+)*))?$/;

function components(s: string): string[] {
  return s.split(/[:.]/);
}

function toPoint(parts: readonly string[]): RefPoint | null {
  const first = parts[0];
  if (first === undefined) return null;
  const dm = /^(\d+)([ab])$/.exec(first);
  const nums = parts.slice(1).map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (dm) return { kind: "daf", daf: Number(dm[1]), amud: dm[2] as "a" | "b", line: nums[0] ?? null };
  if (!/^\d+$/.test(first)) return null;
  return { kind: "chapter", chapter: Number(first), verse: nums[0] ?? null, sub: nums[1] ?? null };
}

function parseLocation(loc: string): { start: RefPoint; end: RefPoint | null } | null {
  const m = LOC.exec(loc.trim());
  if (!m) return null;
  const a = components(m[1] as string);
  const start = toPoint(a);
  if (!start) return null;
  if (m[2] === undefined) return { start, end: null };
  let b = components(m[2]);
  // "31:16-17": the end inherits the leading components it leaves out — unless it is a daf ("2a-3b")
  const endIsDaf = /^\d+[ab]$/.test(b[0] ?? "");
  if (b.length < a.length && !endIsDaf) b = [...a.slice(0, a.length - b.length), ...b];
  const end = toPoint(b);
  if (!end) return null;
  return { start, end };
}

function pointKey(p: RefPoint | null): number[] {
  if (!p) return [0, 0, 0];
  if (p.kind === "daf") return [p.daf * 2 + (p.amud === "b" ? 1 : 0), p.line ?? 0, 0];
  return [p.chapter, p.verse ?? 0, p.sub ?? 0];
}

// ---------------- public API ----------------

const SPLIT = /^(.*?)[\s,]+(\d+[ab]?(?:[:.]\d+)*(?:\s*[-\u2013]\s*\d+[ab]?(?:[:.]\d+)*)?)$/;

/** Parse a Sefaria-style ref. Never throws. */
export function parseSefariaRef(input: string | null | undefined): RefParse {
  const ref = (input ?? "").replace(/\s+/g, " ").trim();
  if (ref.length === 0) return { ok: false, ref, reason: "empty", title: null };
  const sm = SPLIT.exec(ref);
  const title = sm ? (sm[1] as string) : ref;
  const locStr = sm ? (sm[2] as string) : null;
  const r = resolveTitle(title);
  if (!r) return { ok: false, ref, reason: "unknown-title", title };
  let start: RefPoint | null = null;
  let end: RefPoint | null = null;
  if (locStr !== null) {
    const loc = parseLocation(locStr);
    if (!loc) return { ok: false, ref, reason: "bad-location", title };
    start = loc.start;
    end = loc.end;
  }
  let workKey = r.entry.workKey;
  if (r.commentator !== null) {
    const isRambamOnMishnah = foldBasic(r.commentator) === "rambam" && r.entry.corpus === "mishnah";
    workKey = isRambamOnMishnah ? "rambam-peirush-hamishnayos" : lookupWork(r.commentator).key;
  }
  return {
    ok: true,
    ref,
    corpus: r.entry.corpus,
    book: r.entry.title,
    section: r.section?.name ?? null,
    sectionHe: r.section?.he ?? null,
    commentator: r.commentator,
    workKey,
    baseWorkKey: r.entry.workKey,
    he: r.entry.he,
    en: r.entry.en,
    start,
    end,
    sortKey: [r.entry.order, r.section?.order ?? 0, ...pointKey(start)],
  };
}

/** Lexicographic comparison of sort keys (traditional order). */
export function compareSortKeys(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Compare two refs in traditional order; unparseable refs sort last, by string. */
export function compareRefs(a: string, b: string): number {
  const pa = parseSefariaRef(a);
  const pb = parseSefariaRef(b);
  if (pa.ok && pb.ok) return compareSortKeys(pa.sortKey, pb.sortKey) || (a < b ? -1 : a > b ? 1 : 0);
  if (pa.ok) return -1;
  if (pb.ok) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Outbound Sefaria URL for a ref (concept-quiet decision 5: resolved sources only). */
export function sefariaUrl(ref: string): string {
  return `https://www.sefaria.org/${encodeURIComponent(ref.trim())}`;
}

function pointLabel(p: RefPoint, lang: "en" | "he"): string {
  if (lang === "en") {
    if (p.kind === "daf") return `${p.daf}${p.amud}${p.line !== null ? `:${p.line}` : ""}`;
    return [p.chapter, p.verse, p.sub].filter((x): x is number => x !== null).join(":");
  }
  const num = (n: number): string => (n >= 1 && n <= 999 ? toHebrewNumeral(n, { punctuate: false }) : String(n));
  if (p.kind === "daf") return `${num(p.daf)} ${p.amud === "a" ? "ע\"א" : "ע\"ב"}`;
  return [p.chapter, p.verse].filter((x): x is number => x !== null).map(num).join(", ");
}

/** Short display label for a parsed ref: "Bereishis 12:6" / "בראשית יב, ו". */
export function refLabel(p: ParsedRef, lang: "en" | "he"): string {
  const name = lang === "en" ? p.en : p.he;
  const section = lang === "en" ? p.section : p.sectionHe ?? p.section;
  const head = section ? `${name}, ${section}` : name;
  if (!p.start) return head;
  const range = p.end ? `${pointLabel(p.start, lang)}\u2013${pointLabel(p.end, lang)}` : pointLabel(p.start, lang);
  return `${head} ${range}`;
}
