/**
 * Translation overlays (P4c, `src/types.ts` ShiurTranslation / CorpusTranslation,
 * docs/translation-runbook.md). The pipeline writes `en` and `yi`; every further content language
 * (`TranslatedLang` of `@emunas/i18n`, = the pipeline's `TranslationLang`) comes from overlay files
 * keyed by the path of the text they translate:
 *
 *   derived/shiurim/<id>/i18n/<lang>.json      one shiur (`x.<path>`, `w.<block>.…` keys)
 *   derived/corpus/i18n/<lang>/<part>.json     corpus entries (`<collection>:<id>.<field>` keys)
 *
 * An overlay is applied only when the hash it records equals the hash of the current en/yi source,
 * computed exactly as the pipeline does (`scripts/lib/translate.ts`: `shiurSlots`, `corpusEntries`,
 * `hashSlots`; a real-data test pins this copy to it). A stale or invalid overlay is ignored, and
 * the text falls back to the source languages in the sites (`CONTENT_FALLBACK`).
 *
 * Every read goes through the allow-listed `DataReader`. Overlays carry translated published text
 * only; the transcript is never involved.
 */
import { createHash } from "node:crypto";
import { SOURCE_LANGS, UI_LANGS, type TranslatedLang } from "@emunas/i18n";
import type { Extraction, Localized, TranslationLang, Writeup } from "../../../../src/types.ts";
import type { LayerTranslationCounts } from "../public/corpus-layer.ts";
import type { DataReader } from "./read.ts";

/** The overlay languages, in `UI_LANGS` order (today `he`). */
export const TRANSLATED_LANGS: readonly TranslatedLang[] = UI_LANGS.filter(
  (l): l is TranslatedLang => !(SOURCE_LANGS as readonly string[]).includes(l),
);

// The site's translated languages and the pipeline's must be the same set.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameLangs: Same<TranslatedLang, TranslationLang> = true;
void sameLangs;

/** One translatable text: its key and the Yiddish and English it is translated from (pipeline `Slot`). */
export interface Slot {
  k: string;
  yi: string;
  /** Absent for write-up paragraphs whose English block is split differently. */
  en?: string;
}

/** The pipeline's source hash of a list of slots. */
export function hashSlots(slots: readonly Slot[]): string {
  return createHash("sha256").update(JSON.stringify(slots)).digest("hex").slice(0, 16);
}

type Loc = Pick<Localized, "en" | "yi"> | null | undefined;

function loc(slots: Slot[], k: string, v: Loc): void {
  if (!v || (!v.yi && !v.en)) return;
  slots.push({ k, yi: v.yi, en: v.en });
}

/** The slots of one shiur, in the pipeline's order. */
export function shiurSlots(x: Extraction, w: Writeup): Slot[] {
  const s: Slot[] = [];
  loc(s, "x.summary.oneLiner", x.summary.oneLiner);
  loc(s, "x.summary.abstract", x.summary.abstract);
  x.summary.keyPoints.forEach((p, i) => loc(s, `x.summary.keyPoints.${i}.text`, p.text));
  x.sections.forEach((sec, i) => {
    loc(s, `x.sections.${i}.title`, sec.title);
    loc(s, `x.sections.${i}.summary`, sec.summary);
    sec.subsections.forEach((sub, j) => {
      loc(s, `x.sections.${i}.subsections.${j}.title`, sub.title);
      loc(s, `x.sections.${i}.subsections.${j}.summary`, sub.summary);
    });
  });
  x.insights.forEach((v, i) => loc(s, `x.insights.${i}.text`, v.text));
  x.stories.forEach((v, i) => {
    loc(s, `x.stories.${i}.title`, v.title);
    loc(s, `x.stories.${i}.retelling`, v.retelling);
  });
  x.questions.forEach((v, i) => {
    loc(s, `x.questions.${i}.question`, v.question);
    loc(s, `x.questions.${i}.answer`, v.answer);
  });
  x.takeaways.forEach((v, i) => loc(s, `x.takeaways.${i}.text`, v.text));
  w.yi.forEach((block, b) => {
    const enBlock = w.en.find((e) => e.sectionIndex === block.sectionIndex);
    if (block.heading) s.push({ k: `w.${b}.heading`, yi: block.heading, ...(enBlock?.heading ? { en: enBlock.heading } : {}) });
    const sameShape = enBlock?.paragraphs.length === block.paragraphs.length;
    block.paragraphs.forEach((p, i) => {
      const en = sameShape ? enBlock.paragraphs[i]?.text : undefined;
      s.push({ k: `w.${b}.paragraphs.${i}.text`, yi: p.text, ...(en ? { en } : {}) });
    });
  });
  return s;
}

/** The corpus records a corpus overlay can translate (the fields `corpusEntries` reads). */
export interface CorpusTranslatable {
  concepts: readonly { id: string; label: Loc; definition: Loc }[];
  stories: readonly { id: string; title: Loc; retelling: Loc }[];
  topics: readonly { id: string; label: Loc; description: Loc }[];
  teachingClusters: readonly { id: string; label: Loc; summary: Loc }[];
  people: readonly { id: string; description: Loc }[];
  series: Iterable<{ seriesId: string; title: Loc; overview: Loc; keyThemes: readonly Loc[]; arc: readonly { shiurId: string; oneLiner: Loc }[] }>;
}

/** Every corpus entry with translatable text, keyed `<collection>:<id>` (pipeline `corpusEntries`). */
export function corpusEntrySlots(c: CorpusTranslatable): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  const add = (entry: string, field: string, v: Loc) => {
    if (!v || (!v.yi && !v.en)) return;
    const list = out.get(entry) ?? [];
    list.push({ k: `${entry}.${field}`, yi: v.yi, en: v.en });
    out.set(entry, list);
  };
  for (const r of c.concepts) for (const f of ["label", "definition"] as const) add(`concepts:${r.id}`, f, r[f]);
  for (const r of c.stories) for (const f of ["title", "retelling"] as const) add(`stories:${r.id}`, f, r[f]);
  for (const r of c.topics) for (const f of ["label", "description"] as const) add(`topics:${r.id}`, f, r[f]);
  for (const r of c.teachingClusters) for (const f of ["label", "summary"] as const) add(`teaching-clusters:${r.id}`, f, r[f]);
  for (const r of c.people) add(`people:${r.id}`, "description", r.description);
  for (const s of c.series) {
    const e = `series:${s.seriesId}`;
    add(e, "title", s.title);
    add(e, "overview", s.overview);
    s.keyThemes.forEach((t, i) => add(e, `keyThemes.${i}`, t));
    for (const a of s.arc) add(e, `arc.${a.shiurId}.oneLiner`, a.oneLiner);
  }
  return out;
}

// ---------------------------------------------------------------- reading

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Only string → string entries survive; anything else in a `text` map is ignored. */
function stringMap(x: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!isRecord(x)) return out;
  for (const [k, v] of Object.entries(x)) if (typeof v === "string") out.set(k, v);
  return out;
}

/** Why an overlay was not applied. */
export type OverlayRejection = "stale" | "invalid";

export interface ShiurOverlayFile {
  /** Raw file text (for the shiur fingerprint). */
  text: string;
  /** Parsed and shaped, or null when the file is not a translation of this shiur in this language. */
  parsed: { sourceHash: string; text: ReadonlyMap<string, string> } | null;
}

/** The overlay files of one shiur that exist, per language. */
export function loadShiurOverlays(reader: DataReader, shiurId: string): Partial<Record<TranslatedLang, ShiurOverlayFile>> {
  const out: Partial<Record<TranslatedLang, ShiurOverlayFile>> = {};
  for (const lang of TRANSLATED_LANGS) {
    const text = reader.readText(`derived/shiurim/${shiurId}/i18n/${lang}.json`);
    if (text === null) continue;
    const json = parseJson(text);
    const ok = isRecord(json) && json["shiurId"] === shiurId && json["lang"] === lang && typeof json["sourceHash"] === "string";
    out[lang] = { text, parsed: ok && isRecord(json["text"]) ? { sourceHash: String(json["sourceHash"]), text: stringMap(json["text"]) } : null };
  }
  return out;
}

/** Current overlay texts of one shiur per language (key → text); languages whose overlay is stale or invalid are absent. */
export type ShiurOverlays = Partial<Record<TranslatedLang, ReadonlyMap<string, string>>>;

/**
 * Keep the overlays whose `sourceHash` is the hash of the shiur's current en/yi text. `onReject`
 * hears about the others.
 */
export function currentShiurOverlays(
  files: Partial<Record<TranslatedLang, ShiurOverlayFile>>,
  source: { extraction: Extraction; writeup: Writeup },
  onReject: (lang: TranslatedLang, why: OverlayRejection) => void = () => {},
): ShiurOverlays {
  const out: ShiurOverlays = {};
  let hash: string | null = null;
  for (const lang of TRANSLATED_LANGS) {
    const f = files[lang];
    if (f === undefined) continue;
    if (f.parsed === null) {
      onReject(lang, "invalid");
      continue;
    }
    hash ??= hashSlots(shiurSlots(source.extraction, source.writeup));
    if (f.parsed.sourceHash !== hash) {
      onReject(lang, "stale");
      continue;
    }
    out[lang] = f.parsed.text;
  }
  return out;
}

/** One corpus entry of an overlay part: the hash it was made from and its texts (field path → text). */
export interface CorpusOverlayEntry {
  sourceHash: string;
  text: ReadonlyMap<string, string>;
}

export interface CorpusOverlayLang {
  /** Part files read (names only). */
  files: string[];
  /** Part files that are not a corpus translation of this language (names only). */
  invalidFiles: string[];
  /** Entry key → its latest translation (a later part file wins, as in the pipeline). */
  entries: Map<string, CorpusOverlayEntry>;
}

export type CorpusOverlayFiles = Partial<Record<TranslatedLang, CorpusOverlayLang>>;

/** Read every corpus overlay part of every translated language. */
export function loadCorpusOverlays(reader: DataReader): CorpusOverlayFiles {
  const out: CorpusOverlayFiles = {};
  for (const lang of TRANSLATED_LANGS) {
    const dir = `derived/corpus/i18n/${lang}`;
    const files = reader.list(dir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) continue;
    const l: CorpusOverlayLang = { files, invalidFiles: [], entries: new Map() };
    for (const f of files) {
      const json = parseJson(reader.readText(`${dir}/${f}`) ?? "");
      if (!isRecord(json) || json["lang"] !== lang || !isRecord(json["sourceHashes"]) || !isRecord(json["text"])) {
        l.invalidFiles.push(f);
        continue;
      }
      const text = stringMap(json["text"]);
      for (const [entry, h] of Object.entries(json["sourceHashes"])) {
        if (typeof h !== "string") continue;
        const own = new Map<string, string>();
        for (const [k, v] of text) if (k.startsWith(`${entry}.`)) own.set(k.slice(entry.length + 1), v);
        l.entries.set(entry, { sourceHash: h, text: own });
      }
    }
    out[lang] = l;
  }
  return out;
}

/**
 * The current corpus translations: language → entry key → field path → text. An entry is current
 * when its recorded hash equals the hash of the entry's current en/yi text.
 */
export function currentCorpusOverlays(
  files: CorpusOverlayFiles,
  source: CorpusTranslatable,
): { current: Partial<Record<TranslatedLang, ReadonlyMap<string, ReadonlyMap<string, string>>>>; counts: Record<TranslatedLang, LayerTranslationCounts> } {
  const slots = corpusEntrySlots(source);
  const hashes = new Map<string, string>();
  for (const [e, s] of slots) hashes.set(e, hashSlots(s));
  const current: Partial<Record<TranslatedLang, ReadonlyMap<string, ReadonlyMap<string, string>>>> = {};
  const counts = {} as Record<TranslatedLang, LayerTranslationCounts>;
  for (const lang of TRANSLATED_LANGS) {
    const l = files[lang];
    if (l === undefined) {
      counts[lang] = { files: 0, invalidFiles: 0, entries: hashes.size, current: 0, stale: 0 };
      continue;
    }
    const m = new Map<string, ReadonlyMap<string, string>>();
    let stale = 0;
    for (const [entry, t] of l.entries) {
      const h = hashes.get(entry);
      if (h === undefined) continue;
      if (h === t.sourceHash) m.set(entry, t.text);
      else stale++;
    }
    current[lang] = m;
    counts[lang] = { files: l.files.length, invalidFiles: l.invalidFiles.length, entries: hashes.size, current: m.size, stale };
  }
  return { current, counts };
}
