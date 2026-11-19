// P4c translation sources: which en/yi texts a translation must cover, keyed as in ShiurTranslation /
// CorpusTranslation (src/types.ts), plus the hash that marks a translation stale.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CorpusTranslation, Extraction, Localized, ShiurTranslation, TranslationLang, Writeup } from "../../src/types.js";
import { SHIURIM_DIR } from "./manifest.js";

export const CORPUS_DIR = "data/derived/corpus";

/** One text to translate: its key, the Yiddish and English it is translated from. */
export interface Slot {
  k: string;
  yi: string;
  /** Absent for write-up paragraphs whose English block is split differently. */
  en?: string;
}

export function hashSlots(slots: readonly Slot[]): string {
  return createHash("sha256").update(JSON.stringify(slots)).digest("hex").slice(0, 16);
}

export function shiurTranslationPath(shiurId: string, lang: TranslationLang): string {
  return join(SHIURIM_DIR, shiurId, "i18n", `${lang}.json`);
}

export function corpusTranslationDir(lang: TranslationLang): string {
  return join(CORPUS_DIR, "i18n", lang);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loc(slots: Slot[], k: string, v: Localized | undefined): void {
  if (!v || (!v.yi && !v.en)) return;
  slots.push({ k, yi: v.yi, en: v.en });
}

/** The slots of one shiur, or null when it has no extraction + write-up yet. */
export function shiurSlots(shiurId: string): Slot[] | null {
  const dir = join(SHIURIM_DIR, shiurId);
  if (!existsSync(join(dir, "extraction.json")) || !existsSync(join(dir, "writeup.json"))) return null;
  const x = readJson<Extraction>(join(dir, "extraction.json"));
  const w = readJson<Writeup>(join(dir, "writeup.json"));
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

/** Every corpus entry with translatable text, keyed `<collection>:<id>`. */
export function corpusEntries(): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  const add = (entry: string, field: string, v: Localized | undefined) => {
    if (!v || (!v.yi && !v.en)) return;
    const list = out.get(entry) ?? [];
    list.push({ k: `${entry}.${field}`, yi: v.yi, en: v.en });
    out.set(entry, list);
  };
  type Rec = { id: string } & Record<string, unknown>;
  const fields: [string, string, string[]][] = [
    ["concepts", "concepts.json", ["label", "definition"]],
    ["stories", "stories.json", ["title", "retelling"]],
    ["topics", "topics.json", ["label", "description"]],
    ["teaching-clusters", "teaching-clusters.json", ["label", "summary"]],
    ["people", "people.json", ["description"]],
  ];
  for (const [coll, file, names] of fields) {
    for (const r of readJson<Rec[]>(join(CORPUS_DIR, file))) {
      for (const f of names) add(`${coll}:${r.id}`, f, r[f] as Localized | undefined);
    }
  }
  const seriesDir = join(CORPUS_DIR, "series");
  for (const file of readdirSync(seriesDir).filter((f) => f.endsWith(".json")).sort()) {
    const s = readJson<{ seriesId: string; title: Localized; overview: Localized; arc: { shiurId: string; oneLiner: Localized }[]; keyThemes: Localized[] }>(
      join(seriesDir, file),
    );
    const e = `series:${s.seriesId}`;
    add(e, "title", s.title);
    add(e, "overview", s.overview);
    s.keyThemes.forEach((t, i) => add(e, `keyThemes.${i}`, t));
    for (const a of s.arc) add(e, `arc.${a.shiurId}.oneLiner`, a.oneLiner);
  }
  return out;
}

/** All corpus translation parts of a language, merged. Later files win on a duplicate key. */
export function readCorpusTranslations(lang: TranslationLang): { hashes: Map<string, string>; text: Map<string, string>; files: string[] } {
  const dir = corpusTranslationDir(lang);
  const hashes = new Map<string, string>();
  const text = new Map<string, string>();
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
  for (const f of files) {
    const t = readJson<CorpusTranslation>(join(dir, f));
    for (const [k, h] of Object.entries(t.sourceHashes)) hashes.set(k, h);
    for (const [k, v] of Object.entries(t.text)) text.set(k, v);
  }
  return { hashes, text, files };
}

export function readShiurTranslation(shiurId: string, lang: TranslationLang): ShiurTranslation | null {
  const p = shiurTranslationPath(shiurId, lang);
  return existsSync(p) ? readJson<ShiurTranslation>(p) : null;
}
