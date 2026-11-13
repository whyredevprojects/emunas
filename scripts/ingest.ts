// P0 ingest: R2 bucket listing + 2012 Pocket Guide + uncatalogued guide -> data/derived/ingest.json
//
//   npx tsx scripts/ingest.ts
//
// Idempotent: transcripts are cached under out/transcripts/, output order is deterministic, and
// `generatedAt` is kept from the previous run when nothing else in the output changed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { CatalogSource, DerivedFrom, IngestOutput, Lang, Recording, Series, Shiur } from "../src/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_CACHE = join(ROOT, "out", "transcripts");
const OUT_FILE = join(ROOT, "data", "derived", "ingest.json");
const CONCURRENCY = 16;

type Category = Shiur["category"];
type Raw = Record<string, unknown>;

// ---------------------------------------------------------------- warnings

const warnings: string[] = [];
const warnCounts = new Map<string, number>();
function warn(type: string, msg: string): void {
  warnings.push(`[${type}] ${msg}`);
  warnCounts.set(type, (warnCounts.get(type) ?? 0) + 1);
}

function fail(msg: string): never {
  throw new Error(`ingest: ${msg}`);
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(`assertion failed: ${msg}`);
}

// ---------------------------------------------------------------- env + R2

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  const path = join(ROOT, ".env");
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      env[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, "$2");
    }
  }
  for (const k of ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) {
    const v = process.env[k] ?? env[k];
    if (!v) fail(`missing ${k} (set it in .env)`);
    env[k] = v;
  }
  return env;
}

interface BucketObject {
  key: string;
  size: number;
}

async function listBucket(s3: S3Client, bucket: string): Promise<BucketObject[]> {
  const out: BucketObject[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
    for (const o of res.Contents ?? []) if (o.Key !== undefined) out.push({ key: o.Key, size: o.Size ?? 0 });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => cmp(a.key, b.key));
}

interface TranscriptInfo {
  duration: number | null;
  model: string | null;
  textHash: string | null;
  textLen: number;
}

async function fetchTranscripts(s3: S3Client, bucket: string, keys: string[]): Promise<Map<string, TranscriptInfo>> {
  const todo = keys.filter((k) => !existsSync(cachePath(k)));
  let done = 0;
  if (todo.length) console.log(`downloading ${todo.length} transcript json files (${keys.length - todo.length} cached)...`);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < todo.length) {
      const key = todo[next++]!;
      let attempt = 0;
      for (;;) {
        try {
          const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
          const body = await res.Body!.transformToString("utf8");
          JSON.parse(body); // validate before caching
          const p = cachePath(key);
          mkdirSync(dirname(p), { recursive: true });
          writeFileSync(p + ".tmp", body);
          writeFileSync(p, body);
          break;
        } catch (e) {
          if (++attempt >= 4) throw e;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        }
      }
      if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const info = new Map<string, TranscriptInfo>();
  for (const key of keys) {
    const j = JSON.parse(readFileSync(cachePath(key), "utf8")) as { duration?: unknown; model?: unknown; text?: unknown; segments?: { text?: unknown }[] };
    const text = typeof j.text === "string" ? j.text : (j.segments ?? []).map((s) => String(s.text ?? "")).join(" ");
    const norm = text.replace(/\s+/g, " ").trim();
    info.set(key, {
      duration: typeof j.duration === "number" ? Math.round(j.duration * 100) / 100 : null,
      model: typeof j.model === "string" ? j.model : null,
      textHash: norm.length ? createHash("sha1").update(norm).digest("hex") : null,
      textLen: norm.length,
    });
  }
  return info;
}

/** "transcripts/<path>.json" -> out/transcripts/<path>.json */
function cachePath(transcriptJsonKey: string): string {
  return join(OUT_CACHE, transcriptJsonKey.replace(/^transcripts\//, ""));
}

// ---------------------------------------------------------------- small helpers

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function str(r: Raw, k: string): string | null {
  const v = r[k];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}
function strArr(r: Raw, k: string): string[] {
  const v = r[k];
  return Array.isArray(v) ? v.map(String) : [];
}
function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function pad2(n: number | string): string {
  const s = String(n);
  return /^\d$/.test(s) ? "0" + s : s;
}
function stripExt(p: string): string {
  return p.replace(/\.[^./]+$/, "");
}
function basename(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}
function dirOf(p: string): string {
  return p.slice(0, p.lastIndexOf("/"));
}
const AUDIO_RE = /\.(mp3|wma)$/i;

// ---------------------------------------------------------------- Hebrew years

const GEMATRIA: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50, ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};
function gematria(letters: string): number {
  let n = 0;
  for (const ch of letters) n += GEMATRIA[ch] ?? 0;
  return n;
}
/** Normalise the many quote glyphs the catalogs use, and glue "תשל ”ז" back together. */
function normQuotes(s: string): string {
  return s
    .replace(/[״”“„]/g, '"')
    .replace(/[׳’‘`]/g, "'")
    .replace(/([א-ת])\s*"\s*([א-ת])/g, '$1"$2');
}
const HEB_YEAR_RE = /(?<![א-ת])(ת[ק-ת]?[א-ת]?"[א-ת]|ת[ק-ת]"?[א-ת]?)(?![א-ת])/g;

interface YearParse {
  years: number[];
  approx: boolean;
  junk: string | null;
}

/** Parse every year in a catalog field: gematria (תשל"ו), 57xx, or Gregorian (approximate, +3760). */
function parseYears(field: string | null): YearParse {
  const res: YearParse = { years: [], approx: false, junk: null };
  if (!field) return res;
  const s = normQuotes(field);
  let rest = s;
  for (const m of s.matchAll(HEB_YEAR_RE)) {
    const tok = m[1]!;
    if (!tok.includes('"') && tok.length < 3) continue; // a bare "תש" word fragment, not a year
    const v = 5000 + gematria(tok.replace(/"/g, ""));
    if (v >= 5700 && v <= 5800) {
      res.years.push(v);
      rest = rest.replace(tok, " ");
    }
  }
  for (const m of s.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    const n = Number(m[1]);
    if (n >= 5700 && n <= 5800) res.years.push(n);
    else if (n >= 1900 && n <= 2100) {
      res.years.push(n + 3760);
      res.approx = true;
    } else continue;
    rest = rest.replace(m[1]!, " ");
  }
  const leftover = rest.replace(/["'.,\-–:;()\s]/g, "");
  if (leftover.length) res.junk = leftover;
  return res;
}

/** Years mentioned in free text (segment labels like "תשנ"ח -"). Only gematria/57xx, no junk check. */
function yearsInText(text: string): number[] {
  return parseYears(text).years.filter((y, i, a) => a.indexOf(y) === i);
}

function uniqSorted(ns: number[]): number[] {
  return [...new Set(ns)].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- catalog loading

interface CatalogSection {
  id: string;
  title: string;
  dir?: string;
  language?: string;
  media_dirs?: string[];
  rows: Raw[];
  [k: string]: unknown;
}
interface PocketGuide {
  sections: CatalogSection[];
  gramen: { page: number; heading: string[] }[];
}
interface UncatGuide {
  sections: CatalogSection[];
}

const pocket = JSON.parse(readFileSync(join(ROOT, "data/catalog/pocket-guide-2012.json"), "utf8")) as PocketGuide;
const uncat = JSON.parse(readFileSync(join(ROOT, "data/catalog/uncatalogued-guide.json"), "utf8")) as UncatGuide;
const uncatAudio = JSON.parse(readFileSync(join(ROOT, "data/catalog/uncatalogued-audio.json"), "utf8")) as string[];

const CATEGORY: Record<string, Category> = {
  "parshas-hashavua": "parsha",
  "parsha-en": "parsha",
  zmanim: "zman",
  "zmanim-en": "zman",
  shonos: "shonos",
  "miscellaneous-en": "misc",
  simchos: "simcha",
  "simchos-en": "simcha",
  current: "current",
  "purim-seudos": "purim",
};
function categoryOf(sectionId: string): Category {
  return CATEGORY[sectionId] ?? "set";
}
/** Sections where `n` restarts per parsha / zman, so ids need the group ordinal. */
const GROUPED: Record<string, "parsha" | "zman"> = {
  "parshas-hashavua": "parsha",
  "parsha-en": "parsha",
  zmanim: "zman",
  "zmanim-en": "zman",
};

// ---------------------------------------------------------------- shiur drafts

interface Draft {
  id: string;
  lang: Lang;
  category: Category;
  source: CatalogSource;
  sectionId: string;
  sectionTitle: string;
  n: string | null;
  page: number | null;
  titleOriginal: string;
  subTitle: string | null;
  heading: string | null;
  derived: DerivedFrom;
  note: string | null;
  parsha: string | null;
  zman: string | null;
  perek: string | null;
  years: number[];
  files: string[]; // audio paths in playback order (catalog-declared)
  fileless: boolean; // catalog lists no file at all
  forcedOut: string | null; // out-of-scope reason fixed at draft time (purim, gramen)
  sortKey: (string | number)[]; // for ordering inside a series
  seriesHint: string | null; // folder-level series name (current/*)
  seriesPerek?: number | null; // numeric perek for Tanya ordering
}

const drafts: Draft[] = [];
const draftById = new Map<string, Draft>();
function addDraft(d: Draft): void {
  if (draftById.has(d.id)) fail(`duplicate shiur id ${d.id}`);
  draftById.set(d.id, d);
  drafts.push(d);
}

/** Declared redundancy between audio paths. */
interface Relation {
  redundant: string;
  canonical: string;
  kind: "duplicate" | "part";
  why: string;
}
const relations: Relation[] = [];

// ---- junk rows

function isJunkRow(r: Raw): boolean {
  const n = str(r, "n") ?? "";
  const vals = Object.values(r).map((v) => String(v));
  return /#\s*$/.test(n) || vals.some((v) => /\bTITle\b|subTITle|^TANYA ENGLISH פרק$/.test(v));
}

// ---- merged PDF rows: explicit manual split (the text cannot be split mechanically)

interface ManualPart {
  n: string;
  zman?: string;
  inyan?: string;
  year: string;
  title: string;
  fileIdx: number;
}
const MANUAL_SPLITS: { section: string; nRaw: string; parts: ManualPart[] }[] = [
  {
    section: "zmanim-en",
    nRaw: "1 ”ט 1",
    parts: [
      { n: "1", zman: "שובבים", year: "תשס”ח", title: "The Sweetness of תורה One Feels when Learning Properly", fileIdx: 0 },
      { n: "1", zman: "ט”ו בשבט", year: "תשנ”ו", title: "ט”ו בשבט Ushers in the Months of חסד (A Deeper Understanding of the צירופי החודש)", fileIdx: 1 },
    ],
  },
  {
    section: "zmanim-en",
    nRaw: "2 ”ל 1 ”ל 2 ”ל 3 ”ל 4 ”ל 5",
    parts: [
      { n: "2", zman: "ספירה", year: "תש”ס", title: "סדרות מחוברים During ספירה - A Time for Unity Between Different Sects of Jews", fileIdx: 0 },
      { n: "1", zman: "ל”ג בעומר", year: "תשמ”ט", title: "Why the תלמידי ר' עקיבא Stopped Dying When the Week of ל”ג בעומר Arrived", fileIdx: 1 },
      { n: "2", zman: "ל”ג בעומר", year: "תשנ”ו", title: "The מדה of הוד and its Connection to רשב”י", fileIdx: 2 },
      { n: "3", zman: "ל”ג בעומר", year: "תשס”ה", title: "Why ל”ג בעומר is the עיקר day of ספירה", fileIdx: 3 },
      { n: "4", zman: "ל”ג בעומר", year: "תשס”ה", title: "רשב”י - The נשמה of משיח", fileIdx: 4 },
      { n: "5", zman: "ל”ג בעומר", year: "תשס”ה", title: "The Light of יובל Begins to be Revealed", fileIdx: 5 },
    ],
  },
  {
    section: "zmanim-en",
    nRaw: "3 ט 4",
    parts: [
      { n: "3", zman: "ט' באב", year: "תשס”ה", title: "The Transformation of ט 'באב to שמיני עצרת and ירמיהו הנביא to שלמה המלך", fileIdx: 0 },
      { n: "4", zman: "ט' באב", year: "תשע”א", title: "Linking ט 'באב to פסח", fileIdx: 1 },
    ],
  },
  {
    section: "miscellaneous-en",
    nRaw: "18 19a 19b",
    parts: [
      { n: "18", inyan: "Summer", year: "תש”ע", title: "Preparing for a Good Summer (Connection to שלח/קרח and תמוז/אב)", fileIdx: 0 },
      { n: "19a", inyan: "ט”ו בשבט", year: "תשע”א", title: "Tu Bishvat, Mashiach and Birthdays", fileIdx: 1 },
      { n: "19b", inyan: "Ocean Waves", year: "תשע”א", title: "The Striving of the Rising Waves", fileIdx: 2 },
    ],
  },
];

// ---- side / segment splitting for multi-file rows

interface Segment {
  label: string;
  text: string;
}

/** Find labelled segments ("צד א:", "א)", "א -", "#1", "תשנ"ח -") in order. Returns null if fewer than 2. */
function findSegments(text: string): { prefix: string; segs: Segment[]; kind: string } | null {
  // length-preserving glyph normalisation for matching; slices are taken from the original text
  const t = text.replace(/[״”“„]/g, '"').replace(/[׳’‘`]/g, "'");
  const orig = text;
  const LETTERS = ["א", "ב", "ג", "ד", "ה"];
  const strategies: { kind: string; label: (i: number) => RegExp | null }[] = [
    { kind: "side", label: (i) => (i < 2 ? new RegExp(`צד\\s*${LETTERS[i]}\\s*:`, "g") : null) },
    { kind: "hash", label: (i) => new RegExp(`#\\s*${i + 1}(?!\\d)`, "g") },
    { kind: "letter", label: (i) => (i < LETTERS.length ? new RegExp(`(?:^|\\s)${LETTERS[i]}\\s*(?:\\)|:|-\\s|\\s-)`, "g") : null) },
  ];
  for (const st of strategies) {
    const pos: { start: number; end: number; label: string }[] = [];
    let from = 0;
    for (let i = 0; ; i++) {
      const re = st.label(i);
      if (!re) break;
      re.lastIndex = from;
      const m = re.exec(t);
      if (!m) break;
      pos.push({ start: m.index, end: m.index + m[0].length, label: m[0].trim() });
      from = m.index + m[0].length;
    }
    if (pos.length >= 2) {
      const prefix = orig.slice(0, pos[0]!.start).trim();
      // a letter label must open the text (or follow a short header); otherwise it's prose
      if (st.kind === "letter" && prefix.length > 0) continue;
      const segs = pos.map((p, i) => ({ label: orig.slice(p.start, p.end).trim(), text: orig.slice(p.end, i + 1 < pos.length ? pos[i + 1]!.start : undefined).trim() }));
      return { prefix, segs, kind: st.kind };
    }
  }
  // year-labelled segments: "תשנ"ח- ..." / "תש"ס - ..."
  const yre = /(?<![א-ת])(ת[ק-ת]?[א-ת]?"\s*[א-ת])\s*-/g;
  const ypos = [...t.matchAll(yre)].map((m) => ({ start: m.index, end: m.index + m[0].length, label: m[1]! }));
  if (ypos.length >= 2) {
    const prefix = orig.slice(0, ypos[0]!.start).trim();
    const segs = ypos.map((p, i) => ({ label: orig.slice(p.start, p.end).trim(), text: orig.slice(p.start, i + 1 < ypos.length ? ypos[i + 1]!.start : undefined).trim() }));
    return { prefix, segs, kind: "year" };
  }
  return null;
}

// ---- pocket guide

function sectionLang(sec: CatalogSection): Lang {
  if (sec.language) return sec.language === "English" ? "en" : "yi";
  return sec.dir === "ltr" ? "en" : "yi";
}

/** ASCII id component for a parsha/zman value: consonantal transliteration of the catalog spelling. */
const TRANSLIT: Record<string, string> = {
  א: "", ב: "b", ג: "g", ד: "d", ה: "h", ו: "v", ז: "z", ח: "ch", ט: "t", י: "y", כ: "k", ך: "k", ל: "l", מ: "m", ם: "m",
  נ: "n", ן: "n", ס: "s", ע: "", פ: "p", ף: "f", צ: "tz", ץ: "tz", ק: "k", ר: "r", ש: "sh", ת: "s",
};
function groupSlug(value: string | null): string {
  const v = normQuotes(value ?? "").replace(/["']/g, "");
  const words = v.split(/[^א-תA-Za-z0-9]+/).filter(Boolean).slice(0, 3);
  const slug = slugify(words.map((w) => [...w].map((c) => TRANSLIT[c] ?? c).join("")).join("-"));
  return slug || "x";
}

function rowYears(r: Raw, ctx: string): number[] {
  const field = str(r, "shana") ?? str(r, "year") ?? str(r, "year_num");
  const p = parseYears(field);
  if (p.approx) warn("year-approx", `${ctx}: Gregorian year "${field}" converted to Hebrew year by +3760 (approximate)`);
  if (p.junk) warn("year-junk", `${ctx}: year field "${field}" has non-year text "${p.junk}"`);
  if (field && !p.years.length) warn("year-unparsed", `${ctx}: could not parse year field "${field}"`);
  return p.years;
}

function titleOf(r: Raw): { title: string; heading: string | null } {
  const inyan = str(r, "inyan");
  const title = str(r, "title");
  if (title && inyan) return { title, heading: inyan };
  return { title: title ?? inyan ?? "", heading: null };
}

/** Disambiguator for sets whose media spans several folders with restarting numbering (emunah-en). */
function dirSuffix(sec: CatalogSection, file: string | undefined): string {
  if (!file || GROUPED[sec.id]) return "";
  const dirs = sec.media_dirs ?? [];
  const d = dirOf(file);
  const i = dirs.indexOf(d);
  if (i <= 0) return "";
  const slug = slugify(basename(d)).replace(/^(new-)?/, "").replace(/-?series/, "");
  return "-" + (slug.match(/\d{4}/)?.[0] ?? slug);
}

function pocketRows(): void {
  pocket.sections.forEach((sec, secIdx) => {
    const lang = sectionLang(sec);
    const category = categoryOf(sec.id);
    sec.rows.forEach((r0, rowIdx) => {
      if (isJunkRow(r0)) {
        warn("junk-row", `pocket-guide ${sec.id} p.${str(r0, "page")}: dropped PDF header row n="${str(r0, "n")}" (${JSON.stringify(r0)})`);
        return;
      }
      const files = r0.file !== undefined ? [String(r0.file)] : strArr(r0, "files");
      const parts = strArr(r0, "parts");
      const nRaw = str(r0, "n") ?? str(r0, "track");

      // merged PDF rows -> explicit split
      const manual = MANUAL_SPLITS.find((m) => m.section === sec.id && m.nRaw === nRaw);
      if (manual) {
        assert(manual.parts.length === files.length, `manual split ${sec.id} ${nRaw} covers all files`);
        warn("merged-row-split", `pocket-guide ${sec.id} p.${str(r0, "page")} n="${nRaw}": PDF merged ${files.length} rows into one; split manually into ${manual.parts.length} shiurim (one per file)`);
        for (const mp of manual.parts) {
          const r: Raw = { ...r0, n: mp.n, year: mp.year, title: mp.title };
          delete r.files;
          if (mp.zman !== undefined) r.zman = mp.zman;
          if (mp.inyan !== undefined) r.inyan = mp.inyan;
          addPocketDraft(sec, secIdx, rowIdx, r, [files[mp.fileIdx]!], lang, category, null, "split by hand from a merged PDF row");
        }
        return;
      }

      if (parts.length) {
        for (const p of parts) relations.push({ redundant: p, canonical: files[0]!, kind: "part", why: `pocket-guide ${sec.id} n=${nRaw} lists it in parts[]` });
      }

      if (files.length > 1) {
        const text = str(r0, "inyan") ?? str(r0, "title") ?? "";
        const seg = findSegments(text);
        const ctx = `pocket-guide ${sec.id} p.${str(r0, "page")} n=${nRaw}`;
        const years = rowYears(r0, ctx);
        if (seg && seg.segs.length === files.length) {
          const letters = "abcdefgh";
          seg.segs.forEach((s, i) => {
            let ys = yearsInText(seg.kind === "year" ? s.text : s.label + " " + s.text);
            let yearNote = "";
            if (!ys.length) {
              if (years.length === seg.segs.length) {
                ys = [years[i]!];
                if (new Set(years).size > 1) yearNote = "year assigned by order of the shana field";
              } else if (new Set(years).size === 1) ys = [years[0]!];
              else {
                warn("split-year-unknown", `${ctx}: side ${s.label} has no year of its own; row years [${years.join(", ")}] left off it`);
              }
            }
            if (yearNote) warn("split-year-by-order", `${ctx}: side ${s.label} -> ${ys.join(",")} (${yearNote})`);
            const r: Raw = { ...r0 };
            const fullTitle = (seg.prefix ? seg.prefix + " " : "") + (seg.kind === "year" ? s.text : `${s.label} ${s.text}`);
            if (str(r0, "inyan")) r.inyan = fullTitle;
            else r.title = fullTitle;
            delete r.shana;
            delete r.year;
            addPocketDraft(sec, secIdx, rowIdx, r, [files[i]!], lang, category, letters[i]!, `side/segment ${s.label} of a ${files.length}-file catalog row`, ys);
          });
          warn("multi-file-split", `${ctx}: ${files.length} files with ${seg.kind}-labelled segments -> split into ${seg.segs.length} shiurim`);
          return;
        }
        if (seg) warn("multi-file-unsplit", `${ctx}: ${seg.segs.length} labelled segments but ${files.length} files; kept as one shiur`);
        else if (new Set(years).size > 1) warn("multi-file-unsplit", `${ctx}: ${files.length} files and ${new Set(years).size} years but no side labels; kept as one shiur`);
      } else {
        const text = str(r0, "inyan") ?? str(r0, "title") ?? "";
        const seg = findSegments(text);
        if (seg?.kind === "side" && files.length === 1) {
          warn("single-file-two-sides", `pocket-guide ${sec.id} n=${nRaw}: title describes two cassette sides but there is one file; kept as one shiur`);
        }
      }
      addPocketDraft(sec, secIdx, rowIdx, r0, files, lang, category, null, null);
    });
  });
}

function addPocketDraft(
  sec: CatalogSection,
  secIdx: number,
  rowIdx: number,
  r: Raw,
  files: string[],
  lang: Lang,
  category: Category,
  side: string | null,
  extraNote: string | null,
  yearsOverride?: number[],
): void {
  const n = str(r, "n") ?? str(r, "track");
  const ctx = `pocket-guide ${sec.id} p.${str(r, "page")} n=${n}${side ? side : ""}`;
  const years = yearsOverride ?? rowYears(r, ctx);
  const group = GROUPED[sec.id];
  const groupVal = group ? str(r, group) : null;
  const nSlug = slugify(n ?? `row-${rowIdx + 1}`);
  const id = [lang, sec.id, group ? groupSlug(groupVal) : null, pad2(nSlug) + dirSuffix(sec, files[0])]
    .filter(Boolean)
    .join("-") + (side ? `-${side}` : "");
  const { title, heading } = titleOf(r);
  const notes = [str(r, "note"), extraNote].filter(Boolean) as string[];
  addDraft({
    id,
    lang,
    category,
    source: "pocket-guide-2012",
    sectionId: sec.id,
    sectionTitle: sec.title,
    n,
    page: typeof r.page === "number" ? r.page : null,
    titleOriginal: title,
    subTitle: str(r, "sub_title"),
    heading,
    derived: "catalog",
    note: notes.length ? notes.join("; ") : null,
    parsha: str(r, "parsha"),
    zman: str(r, "zman"),
    perek: str(r, "perek"),
    years: uniqSorted(years),
    files,
    fileless: files.length === 0,
    forcedOut: null,
    sortKey: [secIdx, rowIdx, side ?? ""],
    seriesHint: null,
  });
  if (!files.length) warn("not-on-disk", `${ctx}: catalog row has no file (2012 guide lists it, not on disk)`);
}

// ---- uncatalogued guide

const pocketWholeByPart = new Map<string, string>();

function uncatRows(): void {
  const secOffset = 100; // uncatalogued rows sort after pocket-guide rows of the same series
  uncat.sections.forEach((sec, secIdx) => {
    const lang = sectionLang(sec);
    const category = categoryOf(sec.id);

    if (sec.id === "purim-seudos") {
      purimRows(sec, secIdx + secOffset, lang);
      return;
    }

    // simchos: "25" + "25-2" (same n, same title) are two tracks of one simcha
    const used = new Set<Raw>();
    sec.rows.forEach((r, rowIdx) => {
      if (used.has(r)) return;
      const file = String(r.file);
      const dup = str(r, "duplicate_of");
      if (dup) {
        relations.push({ redundant: file, canonical: dup, kind: "duplicate", why: `uncatalogued-guide ${sec.id}: ${str(r, "note") ?? "duplicate_of"}` });
        return;
      }
      if (str(r, "derived") === "pocket-guide") {
        const whole = pocketWholeByPart.get(file);
        if (!whole) fail(`uncatalogued ${sec.id} ${file}: derived=pocket-guide but neither duplicate_of nor a pocket-guide part`);
        return; // relation already recorded from the pocket-guide parts[]
      }
      const files = [file];
      if (sec.id === "simchos" || sec.id === "simchos-en") {
        const key = (x: Raw) => `${dirOf(String(x.file))}|${str(x, "n")}|${slugify(str(x, "title") ?? "")}`;
        for (const o of sec.rows) {
          if (o !== r && !used.has(o) && !str(o, "duplicate_of") && key(o) === key(r) && str(o, "part") === "2" && !str(r, "part")) {
            files.push(String(o.file));
            used.add(o);
            warn("grouped-tracks", `uncatalogued ${sec.id}: "${basename(String(o.file))}" grouped as track 2 of "${basename(file)}"`);
          }
        }
      }
      used.add(r);
      const n = str(r, "n") ?? str(r, "track");
      const part = str(r, "part");
      const series = str(r, "series");
      const group = GROUPED[sec.id];
      let idTail: string;
      if (n === null) idTail = slugify(str(r, "raw_name") ?? basename(file));
      else idTail = pad2(slugify(n)) + (part && files.length === 1 && sec.id !== "current" ? `-${slugify(part)}` : "");
      const dirPart =
        sec.id === "simchos" ? slugify(basename(dirOf(file))) : series ? slugify(series.replace(/^\d+\s+/, "")) : null;
      // same n can recur within a folder for different recordings (e.g. 02-11 Purim Katan / 02-11 Purim Katan 5779)
      let id = [lang, sec.id, "unc", group ? groupSlug(str(r, group)) : null, dirPart, idTail].filter(Boolean).join("-");
      if (draftById.has(id)) id += "-" + slugify(stripExt(basename(file))).slice(0, 40);
      const ctx = `uncatalogued ${sec.id} ${basename(file)}`;
      const { title, heading } = titleOf(r);
      addDraft({
        id,
        lang,
        category,
        source: "uncatalogued-guide",
        sectionId: sec.id,
        sectionTitle: sec.title,
        n,
        page: typeof r.page === "number" ? r.page : null,
        titleOriginal: title,
        subTitle: null,
        heading,
        derived: (str(r, "derived") ?? "filename") as DerivedFrom,
        note: str(r, "note"),
        parsha: str(r, "parsha"),
        zman: str(r, "zman"),
        perek: str(r, "perek"),
        years: uniqSorted(rowYears(r, ctx)),
        files,
        fileless: false,
        forcedOut: null,
        sortKey: [secIdx + secOffset, Number.parseInt(n ?? "999", 10) || 0, part ?? "", rowIdx],
        seriesHint: series,
      });
    });
  });
}

function purimRows(sec: CatalogSection, secIdx: number, lang: Lang): void {
  const byYear = new Map<string, Raw[]>();
  for (const r of sec.rows) {
    const dup = str(r, "duplicate_of");
    if (dup) {
      relations.push({ redundant: String(r.file), canonical: dup, kind: "duplicate", why: `uncatalogued-guide purim-seudos: ${str(r, "note") ?? "duplicate"}` });
      continue;
    }
    const y = str(r, "year_num") ?? "unknown";
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(r);
  }
  const num = (r: Raw, k: string) => Number.parseInt(str(r, k) ?? "0", 10) || 0;
  for (const [y, rows] of [...byYear.entries()].sort((a, b) => cmp(a[0], b[0]))) {
    rows.sort((a, b) => num(a, "cd") - num(b, "cd") || num(a, "track") - num(b, "track") || num(a, "part") - num(b, "part") || cmp(String(a.file), String(b.file)));
    const r0 = rows[0]!;
    const titles = [...new Set(rows.map((r) => str(r, "title")).filter((t) => t && !/^Track \d+$/.test(t)))];
    addDraft({
      id: `${lang}-purim-seudos-${slugify(y)}`,
      lang,
      category: "purim",
      source: "uncatalogued-guide",
      sectionId: sec.id,
      sectionTitle: sec.title,
      n: null,
      page: null,
      titleOriginal: titles.join(" / ") || `Purim Seudah ${y}`,
      subTitle: null,
      heading: str(r0, "inyan"),
      derived: "filename",
      note: `one Purim seudah per year; ${rows.length} track(s) grouped`,
      parsha: null,
      zman: str(r0, "zman"),
      perek: null,
      years: uniqSorted(rowYears(r0, `uncatalogued purim-seudos ${y}`)),
      files: rows.map((r) => String(r.file)),
      fileless: false,
      forcedOut: "Purim seudah (out of scope)",
      sortKey: [secIdx, Number(y) || 0],
      seriesHint: null,
    });
  }
}

function gramenRows(): void {
  const seen = new Map<string, number[]>();
  for (const g of pocket.gramen) {
    const head = g.heading.map(normQuotes).join(" | ");
    // the PDF glued the year to the previous word ("פוריםתשמ"ד"), so no word-boundary here
    const yrs = [...head.matchAll(/תש[א-ת]?"[א-ת]/g)].map((m) => 5000 + gematria(m[0].replace(/"/g, "")));
    const key = String(yrs[0] ?? head);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key)!.push(g.page);
  }
  for (const [key, pages] of seen) {
    const g = pocket.gramen.find((x) => x.page === pages[0])!;
    const title = g.heading[0]!.replace(/^\d+\s*/, "").replace(/[“”"]+/g, "").replace(/\s*'\s*/g, "'").trim();
    addDraft({
      id: `yi-gramen-${key}`,
      lang: "yi",
      category: "purim",
      source: "pocket-guide-2012",
      sectionId: "gramen",
      sectionTitle: "גראמען",
      n: null,
      page: pages[0]!,
      titleOriginal: title,
      subTitle: g.heading[1] ?? null,
      heading: null,
      derived: "catalog",
      note: `song lyrics printed on pp. ${pages[0]}-${pages[pages.length - 1]}; sung at the Purim seudah ${key} (see yi-purim-seudos-${key})`,
      parsha: null,
      zman: "פורים",
      perek: null,
      years: /^\d+$/.test(key) ? [Number(key)] : [],
      files: [],
      fileless: true,
      forcedOut: "gramen: Purim song lyrics printed in the guide, not a shiur",
      sortKey: [999, pages[0]!],
      seriesHint: null,
    });
  }
}

// ---------------------------------------------------------------- recordings

const PREFIX: [RegExp, string][] = [
  [/^01 Harav Moshe Wolfson - Yiddish Shiurim\//, "y/"],
  [/^02 Harav Moshe Wolfson - English Shiurim\//, "e/"],
  [/^PURIM SEUDOS\//, "purim/"],
];
function recordingId(audioKey: string): string {
  let p = audioKey;
  for (const [re, rep] of PREFIX) p = p.replace(re, rep);
  const segs = p.split("/");
  const file = segs.pop()!;
  const dirs: string[] = [];
  segs.forEach((d, i) => {
    let s = slugify(d);
    if (i > 0) s = s.replace(/^(y|e)-/, "").replace(/^(\d+-)+/, "").replace(/-e$/, "");
    const parent = dirs[dirs.length - 1];
    if (i > 1 && parent && s.startsWith(parent + "-")) s = s.slice(parent.length + 1).replace(/^(\d+-)+/, "");
    dirs.push(s || slugify(d));
  });
  return [...dirs, slugify(stripExt(file))].filter(Boolean).join("-");
}

const PATH_NOTES: [RegExp, string][] = [
  [/imperfect\s+sound(\s+quality)?/i, "imperfect sound quality"],
  [/\bkids\b/i, "for children (per file name)"],
];
function pathNotes(audioKey: string): string[] {
  const b = basename(audioKey);
  return PATH_NOTES.filter(([re]) => re.test(b)).map(([, n]) => n);
}

// ---------------------------------------------------------------- series

interface SeriesDef {
  id: string;
  lang: Lang;
  en: string;
  yi: string;
  sections: string[];
  match?: (d: Draft) => boolean;
  order?: (d: Draft) => (string | number)[];
}

function perekNum(p: string | null): number | null {
  if (!p) return null;
  const s = normQuotes(p);
  if (/הקדמה/.test(s)) return 0;
  const m = s.match(/[א-ת"]+/);
  if (!m) return null;
  const v = gematria(m[0].replace(/"/g, ""));
  return v || null;
}

const SERIES: SeriesDef[] = [
  { id: "emunah-yi", lang: "yi", en: "Emunah (Yiddish)", yi: "אמונה", sections: ["emunah-1", "emunah-2"] },
  { id: "tanya-yi", lang: "yi", en: "Tanya (Yiddish)", yi: "ספר התניא", sections: ["tanya-1", "tanya-2"], order: (d) => [d.seriesPerek ?? 999, ...d.sortKey] },
  { id: "tefila-yi", lang: "yi", en: "Tefilah (Yiddish)", yi: "תפילה", sections: ["tefila-heb"] },
  { id: "eretz-yisroel-yi", lang: "yi", en: "Eretz Yisroel", yi: "ארץ ישראל", sections: ["eretz-yisroel"], order: (d) => [Number.parseInt(d.n ?? "999", 10), d.source, ...d.sortKey] },
  { id: "shiurim-labachurim-yi", lang: "yi", en: "Shiurim LaBachurim: Hisorerus L'Avodas Hashem", yi: "שיעורים לבחורים", sections: ["shiurim-labachurim"] },
  { id: "shir-hashirim-yi", lang: "yi", en: "Shir Hashirim", yi: "שיר השירים", sections: ["shir-hashirim"] },
  { id: "kedushas-hashabbos-yi", lang: "yi", en: "Kedushas HaShabbos", yi: "קדושת השבת", sections: ["kedushas-hashabbos"] },
  {
    id: "pirkei-avos-yi",
    lang: "yi",
    en: "Pirkei Avos, Perek 6 (Yiddish)",
    yi: "פרקי אבות פרק ששי",
    sections: ["shonos"],
    match: (d) => d.source === "pocket-guide-2012" && /^פרקי אבות/.test(d.heading ?? ""),
    order: (d) => [d.years[0] ?? 0, ...d.sortKey],
  },
  { id: "current-ey-bachurim-5769", lang: "yi", en: "Eretz Yisroel Bachurim 5769", yi: 'שיעורים לבחורים בארץ ישראל תשס"ט', sections: ["current"], match: (d) => d.seriesHint === "03 EY Bachurim 5769" },
  { id: "current-ey-bachurim-5770", lang: "yi", en: "Eretz Yisroel Bachurim 5770", yi: 'שיעורים לבחורים בארץ ישראל תש"ע', sections: ["current"], match: (d) => d.seriesHint === "04 EY Bachurim 5770" },
  { id: "current-bachurim-5771", lang: "yi", en: "Bachurim 5771", yi: 'שיעורים לבחורים תשע"א', sections: ["current"], match: (d) => d.seriesHint === "05 Bachurim 5771" },
  { id: "current-bachurim-5773", lang: "yi", en: "Bachurim 5773", yi: 'שיעורים לבחורים תשע"ג', sections: ["current"], match: (d) => d.seriesHint === "5773 Bachurim" },
  { id: "current-kayitz-5771", lang: "yi", en: "Summer 5771 (Kayitz)", yi: 'קיץ תשע"א', sections: ["current"], match: (d) => d.seriesHint === "Kayitz 5771" },
  { id: "emunah-en", lang: "en", en: "Emunah (English)", yi: "אמונה", sections: ["emunah-en"] },
  { id: "tanya-en", lang: "en", en: "Tanya (English)", yi: "ספר התניא", sections: ["tanya-en"] },
  { id: "tefila-en", lang: "en", en: "Tefilah (English)", yi: "תפילה", sections: ["tefila-en"] },
  { id: "shabbos-tefilah-en", lang: "en", en: "Shabbos Tefilah (English)", yi: "תפילת שבת", sections: ["shabbos-tefilah-en"] },
];

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  const env = loadEnv();
  const s3 = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT!,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  });
  const bucket = env.R2_BUCKET!;

  // 1. bucket
  // transcripts/_manifest/ holds the re-transcription job's bookkeeping, not transcripts.
  const objects = (await listBucket(s3, bucket)).filter((o) => !o.key.startsWith("transcripts/_manifest/"));
  const audioObjs = objects.filter((o) => !o.key.startsWith("transcripts/") && AUDIO_RE.test(o.key));
  const otherObjs = objects.filter((o) => !o.key.startsWith("transcripts/") && !AUDIO_RE.test(o.key));
  if (otherObjs.length) warn("non-audio-object", `ignored ${otherObjs.length} non-audio objects in the bucket (${[...new Set(otherObjs.map((o) => o.key.replace(/^.*\./, ".")))].join(", ")} sidecar files)`);
  const sizeOf = new Map(audioObjs.map((o) => [o.key, o.size]));
  const transcriptJson = objects.filter((o) => o.key.startsWith("transcripts/") && o.key.endsWith(".json")).map((o) => o.key);
  const transcriptPrefixes = new Set(objects.filter((o) => o.key.startsWith("transcripts/")).map((o) => stripExt(o.key)));
  const audioByStem = new Map(audioObjs.map((o) => ["transcripts/" + stripExt(o.key), o.key]));
  for (const t of transcriptJson) if (!audioByStem.has(stripExt(t))) fail(`transcript ${t} has no audio file`);
  for (const p of transcriptPrefixes) {
    for (const ext of [".json", ".txt", ".vtt"]) if (!objects.some((o) => o.key === p + ext)) warn("transcript-incomplete", `${p} is missing ${ext}`);
  }

  // 2. transcripts
  const tinfo = await fetchTranscripts(s3, bucket, transcriptJson);
  const transcriptOf = (audio: string): TranscriptInfo | null => tinfo.get("transcripts/" + stripExt(audio) + ".json") ?? null;

  // 3. catalogs
  for (const sec of pocket.sections) for (const r of sec.rows) for (const p of strArr(r, "parts")) pocketWholeByPart.set(p, String(r.file));
  pocketRows();
  uncatRows();
  gramenRows();

  // every bucket audio file must be referenced by a catalog
  const catalogFiles = new Set<string>();
  for (const d of drafts) for (const f of d.files) catalogFiles.add(f);
  for (const rel of relations) catalogFiles.add(rel.redundant);
  for (const a of audioObjs) if (!catalogFiles.has(a.key)) fail(`audio ${a.key} is in no catalog`);
  const uncatSet = new Set(uncatAudio);
  for (const sec of uncat.sections) for (const r of sec.rows) if (!uncatSet.has(String(r.file))) warn("catalog-mismatch", `uncatalogued-guide row ${r.file} missing from uncatalogued-audio.json`);
  const missing = [...catalogFiles].filter((f) => !sizeOf.has(f)).sort();
  for (const f of missing) warn("not-in-bucket", `catalog file not in R2: ${f}`);

  // 4. recordings
  const recByKey = new Map<string, Recording>();
  const recIds = new Map<string, string>();
  for (const o of audioObjs) {
    const id = recordingId(o.key);
    if (recIds.has(id)) fail(`recording id collision ${id}: ${recIds.get(id)} / ${o.key}`);
    recIds.set(id, o.key);
    const t = transcriptOf(o.key);
    recByKey.set(o.key, {
      id,
      audioKey: o.key,
      transcriptKey: t ? "transcripts/" + stripExt(o.key) : null,
      durationSec: t?.duration ?? null,
      asrModel: t?.model ?? null,
      sizeBytes: o.size,
      duplicateOf: null,
      partOf: null,
    });
  }
  const rec = (k: string) => recByKey.get(k)!;

  // 5. declared duplicates / parts: process each piece of audio once
  const replace = new Map<string, string[]>(); // catalog file -> files that stand in for it in its shiur
  for (const rel of relations) {
    const R = recByKey.get(rel.redundant);
    const C = recByKey.get(rel.canonical);
    if (!R) continue; // redundant copy not uploaded: nothing to do
    if (!C) {
      // the catalogued file itself is missing; the copy stands in for it
      const cur = replace.get(rel.canonical) ?? [];
      if (rel.kind === "duplicate" ? cur.length === 0 : true) replace.set(rel.canonical, [...cur, rel.redundant]);
      else {
        R.duplicateOf = rec(cur[0]!).id;
      }
      warn("dup-stand-in", `${rel.canonical} is not in R2; ${rel.kind} ${basename(rel.redundant)} used in its place`);
      continue;
    }
    if (rel.kind === "duplicate") {
      if (!C.transcriptKey && R.transcriptKey) {
        replace.set(rel.canonical, [rel.redundant]);
        C.duplicateOf = R.id;
        warn("dup-prefer-transcribed", `${basename(rel.redundant)} (transcribed) preferred over its untranscribed original ${basename(rel.canonical)}`);
      } else {
        R.duplicateOf = C.id;
        warn("duplicate", `${R.id} marked duplicateOf ${C.id} (${rel.why})`);
      }
    } else {
      R.partOf = C.id;
      warn("part", `${R.id} marked partOf ${C.id} (${rel.why})`);
    }
  }
  // parts that replace a whole without transcript (whole file untranscribed, all parts transcribed)
  const partsByWhole = new Map<string, string[]>();
  for (const rel of relations) if (rel.kind === "part") partsByWhole.set(rel.canonical, [...(partsByWhole.get(rel.canonical) ?? []), rel.redundant]);
  for (const [whole, parts] of partsByWhole) {
    const W = recByKey.get(whole);
    const P = parts.map((p) => recByKey.get(p));
    if (W && !W.transcriptKey && P.length && P.every((p) => p?.transcriptKey)) {
      for (const p of P) p!.partOf = null;
      W.duplicateOf = P[0]!.id;
      replace.set(whole, parts);
      warn("dup-prefer-transcribed", `${W.id} untranscribed; its transcribed parts are used instead`);
    }
  }

  // 6. resolve recordings per draft
  const recsOf = new Map<Draft, string[]>();
  for (const d of drafts) {
    const keys = d.files.flatMap((f) => replace.get(f) ?? [f]).filter((f) => recByKey.has(f));
    const lost = d.files.filter((f) => !recByKey.has(f) && !replace.has(f));
    if (lost.length && keys.length) warn("partly-missing", `${d.id}: ${lost.length} of ${d.files.length} files not in R2`);
    recsOf.set(d, keys);
  }

  // 7. undeclared duplicates: identical transcript text
  const byHash = new Map<string, { key: string; d: Draft }[]>();
  for (const d of drafts)
    for (const k of recsOf.get(d)!) {
      const t = transcriptOf(k);
      if (!t?.textHash || t.textLen < 500) continue;
      if (!byHash.has(t.textHash)) byHash.set(t.textHash, []);
      byHash.get(t.textHash)!.push({ key: k, d });
    }
  const droppedDrafts = new Set<Draft>();
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    group.sort(
      (a, b) =>
        (a.d.source === "pocket-guide-2012" ? 0 : 1) - (b.d.source === "pocket-guide-2012" ? 0 : 1) ||
        b.d.years.length - a.d.years.length ||
        a.key.length - b.key.length ||
        cmp(a.key, b.key),
    );
    const keep = group[0]!;
    for (const g of group.slice(1)) {
      if (g.d.source === "pocket-guide-2012") {
        warn("identical-transcripts-catalogued", `${rec(g.key).id} and ${rec(keep.key).id} have identical transcripts but are both catalogued rows; left as is`);
        continue;
      }
      rec(g.key).duplicateOf = rec(keep.key).id;
      recsOf.set(g.d, recsOf.get(g.d)!.filter((k) => k !== g.key));
      if (!recsOf.get(g.d)!.length) droppedDrafts.add(g.d);
      // carry over any year the duplicate's file name had
      for (const y of g.d.years) if (!keep.d.years.includes(y)) keep.d.years = uniqSorted([...keep.d.years, y]);
      warn("undeclared-duplicate", `${rec(g.key).id} has the same transcript text as ${rec(keep.key).id}; marked duplicateOf, shiur ${g.d.id} dropped`);
    }
  }

  // 8. shiurim
  const shiurim: Shiur[] = [];
  const draftOfShiur = new Map<string, Draft>();
  for (const d of drafts) {
    if (droppedDrafts.has(d)) continue;
    const keys = recsOf.get(d)!;
    const recIdsArr = keys.map((k) => rec(k).id);
    const transcribed = keys.filter((k) => rec(k).transcriptKey);
    let reason: string | null = d.forcedOut;
    if (!reason && !keys.length) reason = d.fileless ? "not on disk (listed in the 2012 guide, no audio)" : "audio not in R2 bucket";
    if (!reason && !transcribed.length) reason = "untranscribed";
    if (!reason && transcribed.length < keys.length) warn("partly-transcribed", `${d.id}: ${transcribed.length}/${keys.length} recordings transcribed`);
    if (!keys.length && !d.fileless && !d.forcedOut) warn("no-audio", `${d.id}: all ${d.files.length} catalog files are absent from R2`);
    const s: Shiur = {
      id: d.id,
      lang: d.lang,
      category: d.category,
      seriesId: null,
      seriesOrder: null,
      catalog: {
        source: d.source,
        sectionId: d.sectionId,
        sectionTitle: d.sectionTitle,
        n: d.n,
        page: d.page,
        titleOriginal: d.titleOriginal,
        subTitle: d.subTitle,
        ...(d.heading ? { heading: d.heading } : {}),
        derived: d.derived,
        note: d.note,
      },
      parsha: d.parsha,
      zman: d.zman,
      perek: d.perek,
      hebrewYears: d.years,
      recordingIds: recIdsArr,
      inScope: reason === null,
      outOfScopeReason: reason,
      pathNotes: [...new Set(keys.flatMap(pathNotes))],
    };
    if (!s.catalog.titleOriginal) warn("empty-title", `${d.id}: no title in catalog`);
    shiurim.push(s);
    draftOfShiur.set(s.id, d);
  }

  // 9. series
  const series: Series[] = [];
  const shiurById = new Map(shiurim.map((s) => [s.id, s]));
  // tanya: numeric perek for ordering; blank cells inherit the previous row's perek (the PDF dropped them);
  // a perek outside the range of its two neighbours is reported as a likely catalog error (value kept).
  for (const secId of ["tanya-1", "tanya-2", "tanya-en"]) {
    const rows = drafts.filter((x) => x.sectionId === secId && !droppedDrafts.has(x)).sort((a, b) => cmpKey(a.sortKey, b.sortKey));
    const nums = rows.map((d) => perekNum(d.perek));
    let prev: number | null = null;
    rows.forEach((d, i) => {
      const p = nums[i] ?? null;
      if (p === null) {
        if (d.source === "pocket-guide-2012") warn("perek-blank", `${d.id}: perek blank in catalog (n=${d.n})`);
        d.seriesPerek = prev;
        return;
      }
      const before = nums.slice(0, i).reverse().find((x) => x !== null) ?? null;
      const after = nums.slice(i + 1).find((x) => x !== null) ?? null;
      if (before !== null && after !== null && before <= after && (p < before || p > after)) {
        warn("perek-out-of-sequence", `${d.id}: perek "${d.perek}" (${p}) sits between perek ${before} and ${after}; catalog value kept`);
      }
      d.seriesPerek = p;
      prev = p;
    });
  }
  for (const def of SERIES) {
    const members = shiurim
      .map((s) => draftOfShiur.get(s.id)!)
      .filter((d) => def.sections.includes(d.sectionId) && (def.match ? def.match(d) : true));
    if (!members.length) fail(`series ${def.id} has no members`);
    const ord = def.order ?? ((d: Draft) => d.sortKey);
    members.sort((a, b) => cmpKey(ord(a), ord(b)) || cmp(a.id, b.id));
    members.forEach((d, i) => {
      const s = shiurById.get(d.id)!;
      if (s.seriesId) fail(`${s.id} in two series (${s.seriesId}, ${def.id})`);
      s.seriesId = def.id;
      s.seriesOrder = i + 1;
    });
    series.push({
      id: def.id,
      title: { en: def.en, yi: def.yi },
      lang: def.lang,
      catalogSectionIds: [...new Set(members.map((d) => d.sectionId))].sort((a, b) => def.sections.indexOf(a) - def.sections.indexOf(b)),
      shiurIds: members.map((d) => d.id),
    });
  }
  for (const s of shiurim) if (s.category === "set" && !s.seriesId) warn("set-without-series", `${s.id} (${s.catalog.sectionId}) is in a set section but no series`);

  // 10. ordering
  shiurim.sort((a, b) => cmpKey(draftOfShiur.get(a.id)!.sortKey, draftOfShiur.get(b.id)!.sortKey) || cmp(a.id, b.id));
  const recordings = [...recByKey.values()].sort((a, b) => cmp(a.audioKey, b.audioKey));

  // 11. sanity checks
  const owner = new Map<string, string>();
  for (const s of shiurim) {
    assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.id), `ascii slug id ${s.id}`);
    for (const r of s.recordingIds) {
      assert(!owner.has(r), `recording ${r} attached to ${owner.get(r)} and ${s.id}`);
      owner.set(r, s.id);
    }
  }
  assert(new Set(shiurim.map((s) => s.id)).size === shiurim.length, "unique shiur ids");
  assert(new Set(recordings.map((r) => r.id)).size === recordings.length, "unique recording ids");
  const recById = new Map(recordings.map((r) => [r.id, r]));
  for (const r of recordings) {
    assert(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.id), `ascii slug id ${r.id}`);
    const redundant = r.duplicateOf ?? r.partOf;
    if (redundant) {
      assert(!owner.has(r.id), `redundant recording ${r.id} is attached to ${owner.get(r.id)}`);
      assert(recById.has(redundant), `${r.id} points at existing recording ${redundant}`);
      const target = recById.get(redundant)!;
      assert(!target.duplicateOf && !target.partOf, `${r.id} -> ${redundant} is not a chain`);
    } else assert(owner.has(r.id), `recording ${r.id} is attached to a shiur or marked redundant`);
  }
  let attachedTranscripts = 0;
  let redundantTranscripts = 0;
  for (const r of recordings) {
    if (!r.transcriptKey) continue;
    if (r.duplicateOf || r.partOf) {
      redundantTranscripts++;
      continue;
    }
    const s = shiurById.get(owner.get(r.id)!)!;
    // A deliberately out-of-scope shiur (e.g. Purim seudah) may get a transcript later; keep it out of scope.
    if (!s.inScope && /out of scope/.test(s.outOfScopeReason ?? "")) warn("transcribed-out-of-scope", `${r.id} is transcribed but its shiur ${s.id} stays out of scope (${s.outOfScopeReason})`);
    else assert(s.inScope, `transcribed recording ${r.id} attached to out-of-scope shiur ${s.id} (${s.outOfScopeReason})`);
    attachedTranscripts++;
  }
  assert(attachedTranscripts + redundantTranscripts === transcriptJson.length, "every transcript accounted for");
  for (const s of shiurim) if (s.inScope) assert(s.recordingIds.some((id) => recById.get(id)!.transcriptKey), `in-scope ${s.id} has a transcript`);
  for (const ser of series) for (const id of ser.shiurIds) assert(shiurById.get(id)?.seriesId === ser.id, `series ${ser.id} member ${id}`);

  // 12. stats
  const stats: Record<string, number> = {};
  const inc = (k: string, by = 1) => (stats[k] = (stats[k] ?? 0) + by);
  stats["bucket.objects"] = objects.length;
  stats["bucket.audio"] = audioObjs.length;
  stats["bucket.transcripts"] = transcriptJson.length;
  stats["recordings"] = recordings.length;
  stats["recordings.transcribed"] = recordings.filter((r) => r.transcriptKey).length;
  stats["recordings.duplicateOf"] = recordings.filter((r) => r.duplicateOf).length;
  stats["recordings.partOf"] = recordings.filter((r) => r.partOf).length;
  stats["transcripts.attachedInScope"] = attachedTranscripts;
  stats["transcripts.redundant"] = redundantTranscripts;
  stats["shiurim"] = shiurim.length;
  stats["shiurim.inScope"] = shiurim.filter((s) => s.inScope).length;
  stats["shiurim.inScope.hours"] = Math.round(
    shiurim.filter((s) => s.inScope).reduce((t, s) => t + s.recordingIds.reduce((u, id) => u + (recById.get(id)!.durationSec ?? 0), 0), 0) / 36,
  ) / 100;
  for (const s of shiurim) {
    const scope = s.inScope ? "inScope" : "outOfScope";
    inc(`shiurim.${scope}.lang.${s.lang}`);
    inc(`shiurim.${scope}.category.${s.category}`);
    inc(`shiurim.${scope}.source.${s.catalog.source}`);
    if (!s.inScope) inc(`shiurim.outOfScope.reason.${slugify(s.outOfScopeReason ?? "")}`);
    if (s.seriesId) inc(`shiurim.${scope}.series.${s.seriesId}`);
  }
  stats["series"] = series.length;
  for (const [k, v] of [...warnCounts].sort()) stats[`warnings.${k}`] = v;
  const sortedStats: Record<string, number> = {};
  for (const k of Object.keys(stats).sort()) sortedStats[k] = stats[k]!;

  // 13. write (keep generatedAt if nothing changed)
  const body = { stats: sortedStats, shiurim, recordings, series, warnings };
  let generatedAt = new Date().toISOString();
  if (existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_FILE, "utf8")) as IngestOutput;
      const { generatedAt: prevAt, ...prevBody } = prev;
      if (JSON.stringify(prevBody) === JSON.stringify(body)) generatedAt = prevAt;
    } catch {
      /* rewrite */
    }
  }
  const output: IngestOutput = { generatedAt, ...body };
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(output, null, 2) + "\n");

  // 14. report
  console.log(`\nwrote ${OUT_FILE}`);
  console.log(`  shiurim: ${shiurim.length} (${stats["shiurim.inScope"]} in scope, ${stats["shiurim.inScope.hours"]} h)`);
  console.log(`  recordings: ${recordings.length} (${stats["recordings.transcribed"]} transcribed, ${stats["recordings.duplicateOf"]} duplicateOf, ${stats["recordings.partOf"]} partOf)`);
  console.log(`  transcripts: ${transcriptJson.length} = ${attachedTranscripts} attached to exactly one in-scope shiur + ${redundantTranscripts} declared duplicates/parts`);
  console.log(`  series: ${series.length}`);
  console.log("\nstats:");
  for (const [k, v] of Object.entries(sortedStats)) if (!k.startsWith("warnings.")) console.log(`  ${k.padEnd(52)} ${v}`);
  console.log("\nwarnings by type:");
  for (const [k, v] of [...warnCounts].sort()) console.log(`  ${k.padEnd(36)} ${v}`);
  console.log("\nall sanity checks passed");
}

function cmpKey(a: (string | number)[], b: (string | number)[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === "number" && typeof y === "number") return x - y;
    return cmp(String(x), String(y));
  }
  return 0;
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
