// P4c: translate validated en/yi content into further languages (TRANSLATION_LANGS in src/types.ts).
// The agent contract is prompts/p4c-translate.md; docs/translation-runbook.md is the procedure.
//
//   npm run -s translate -- source <lang> <shiurId...>        write out/translate/<lang>/shiurim/<id>.json (what to translate)
//   npm run -s translate -- corpus-source <lang> [--size 40]  split missing/stale corpus entries into out/translate/<lang>/corpus/<part>.json
//   npm run -s translate -- validate <file...>                check translation files against the current source
//   npm run -s translate -- status <lang> [--missing] [--shard k/N]
//                                                             counts; --missing prints missing/stale shiur ids (one shard of them)
//
// Translations never read the transcript: their only input is the published en/yi text.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { TRANSLATION_LANGS, type CorpusTranslation, type ShiurTranslation, type TranslationLang } from "../src/types.js";
import { SHIURIM_DIR } from "./lib/manifest.js";
import {
  corpusEntries,
  corpusTranslationDir,
  hashSlots,
  readCorpusTranslations,
  readShiurTranslation,
  shiurSlots,
  type Slot,
} from "./lib/translate.js";
import { PROMPT_VERSIONS } from "./lib/versions.js";

const OUT = "out/translate";

function asLang(v: string | undefined): TranslationLang {
  if (!TRANSLATION_LANGS.includes(v as TranslationLang)) {
    console.error(`language must be one of: ${TRANSLATION_LANGS.join(", ")}`);
    process.exit(2);
  }
  return v as TranslationLang;
}

function writeJson(path: string, v: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(v, null, 1) + "\n");
}

// ---------- per-language text rules ----------

interface LangRules {
  /** Letters that should make up the text. */
  letters: RegExp;
  /** Letters that should not appear (another script). */
  foreign: RegExp;
  /** Patterns that are always errors. */
  errors: [RegExp, string][];
  /** Patterns that are usually mistakes. */
  warnings: [RegExp, string][];
}

const NIKUD = /[֑-ֽֿ-ׇ]/;
const RULES: Record<TranslationLang, LangRules> = {
  he: {
    letters: /[א-ת]/g,
    foreign: /[A-Za-z]/g,
    errors: [
      [/שליט"א|שליט״א/, 'the Mashgiach has passed away: זצ"ל, never שליט"א'],
      [NIKUD, "no nikud or cantillation marks"],
      [/[װ-ײ]/, "Yiddish ligature letters (װ ױ ײ) are not Hebrew"],
    ],
    warnings: [
      [/תמלול|תמליל|טרנסקריפ|משובש|שיבוש|לא ברור|לא מובן|קשה להבין|\bASR\b/, "mentions the transcript or judges the shiur's clarity; say only what the Mashgiach teaches (a remark on the sound or the recording is fine)"],
      [/(^|[\s"'(])הרב (אומר|מסביר|מביא|מספר|שואל|מוסיף|מדגיש|מבאר|מתרץ|מתחיל|ממשיך|מסיים|אמר|הסביר|הביא|סיפר)(?=[\s.,;:!?)]|$)/, 'the Mashgiach is "המשגיח", never "הרב" as a stand-in'],
      [/(^|[\s(])(נישט|וואס|איז|אזוי|ווייל|דאס|מיט|האט)(?=[\s.,;:!?)]|$)/, "looks like Yiddish, not Hebrew"],
    ],
  },
};

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

interface Report {
  file: string;
  errors: string[];
  warnings: string[];
}

function checkTexts(lang: TranslationLang, slots: readonly Slot[], text: Record<string, string>, r: Report): void {
  const rules = RULES[lang];
  const want = new Set(slots.map((s) => s.k));
  for (const k of Object.keys(text)) if (!want.has(k)) r.errors.push(`${k}: not a key of the source`);
  for (const slot of slots) {
    const v = text[slot.k];
    if (typeof v !== "string" || v.trim() === "") {
      r.errors.push(`${slot.k}: missing or empty`);
      continue;
    }
    const letters = (v.match(rules.letters) ?? []).length;
    const foreign = (v.match(rules.foreign) ?? []).length;
    if (letters === 0) r.errors.push(`${slot.k}: not written in the target script`);
    else if (foreign > Math.max(3, letters * 0.05)) r.warnings.push(`${slot.k}: ${foreign} letters in another script`);
    for (const [re, why] of rules.errors) if (re.test(v)) r.errors.push(`${slot.k}: ${why}`);
    for (const [re, why] of rules.warnings) {
      const m = re.exec(v);
      if (m) r.warnings.push(`${slot.k}: "${m[0].trim()}" ${why}`);
    }
    const src = words(slot.yi);
    const out = words(v);
    // Hebrew runs ~0.7x the Yiddish word count (prefixed articles and prepositions).
    if (src >= 25 && (out < src * 0.45 || out > src * 1.5)) r.warnings.push(`${slot.k}: ${out} words for ${src} Yiddish words; translate in full, add nothing`);
  }
}

function common(t: { lang: unknown; model: unknown; promptVersion: unknown }, r: Report): TranslationLang | null {
  if (t.promptVersion !== PROMPT_VERSIONS.p4c) r.errors.push(`promptVersion must be "${PROMPT_VERSIONS.p4c}"`);
  if (typeof t.model !== "string" || !t.model) r.errors.push("model missing");
  if (!TRANSLATION_LANGS.includes(t.lang as TranslationLang)) {
    r.errors.push(`lang must be one of ${TRANSLATION_LANGS.join(", ")}`);
    return null;
  }
  return t.lang as TranslationLang;
}

function validateShiur(file: string, t: ShiurTranslation, r: Report): void {
  const lang = common(t, r);
  if (!lang) return;
  const dirId = basename(dirname(dirname(file)));
  if (t.shiurId !== dirId) r.errors.push(`shiurId "${t.shiurId}" does not match its directory "${dirId}"`);
  if (basename(file) !== `${lang}.json`) r.errors.push(`file must be named ${lang}.json`);
  const slots = shiurSlots(t.shiurId);
  if (!slots) {
    r.errors.push("the shiur has no extraction.json + writeup.json");
    return;
  }
  const hash = hashSlots(slots);
  if (t.sourceHash !== hash) r.errors.push(`sourceHash ${t.sourceHash} is not the current source (${hash}); the en/yi text changed, translate again`);
  if (!t.text || typeof t.text !== "object") {
    r.errors.push("text missing");
    return;
  }
  checkTexts(lang, slots, t.text, r);
}

function validateCorpus(t: CorpusTranslation, r: Report): void {
  const lang = common(t, r);
  if (!lang) return;
  if (!t.text || typeof t.text !== "object" || !t.sourceHashes || typeof t.sourceHashes !== "object") {
    r.errors.push("text or sourceHashes missing");
    return;
  }
  const entries = corpusEntries();
  const slots: Slot[] = [];
  for (const [entry, h] of Object.entries(t.sourceHashes)) {
    const s = entries.get(entry);
    if (!s) {
      r.errors.push(`${entry}: no such corpus entry`);
      continue;
    }
    if (h !== hashSlots(s)) r.errors.push(`${entry}: sourceHash is not the current source (${hashSlots(s)}); translate again`);
    slots.push(...s);
  }
  for (const k of Object.keys(t.text)) {
    const entry = k.slice(0, k.indexOf("."));
    if (!(entry in t.sourceHashes)) r.errors.push(`${k}: its entry ${entry} is not in sourceHashes`);
  }
  checkTexts(lang, slots, t.text, r);
}

function validate(files: string[]): number {
  let bad = 0;
  for (const file of files) {
    const r: Report = { file, errors: [], warnings: [] };
    let t: unknown;
    try {
      t = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      r.errors.push(`not valid JSON: ${(e as Error).message}`);
    }
    if (t && typeof t === "object") {
      if ("shiurId" in t) validateShiur(file, t as ShiurTranslation, r);
      else validateCorpus(t as CorpusTranslation, r);
    }
    if (r.errors.length) bad++;
    console.log(`${r.errors.length ? "FAIL" : "OK  "} ${file}  ${r.errors.length}E/${r.warnings.length}W`);
    for (const e of r.errors.slice(0, 40)) console.log(`  ERROR ${e}`);
    for (const w of r.warnings.slice(0, 40)) console.log(`  warn  ${w}`);
  }
  return bad;
}

function allShiurIds(): string[] {
  return readdirSync(SHIURIM_DIR)
    .filter((d) => existsSync(join(SHIURIM_DIR, d, "writeup.json")) && existsSync(join(SHIURIM_DIR, d, "extraction.json")))
    .sort();
}

function shiurState(id: string, lang: TranslationLang): "done" | "stale" | "missing" {
  const t = readShiurTranslation(id, lang);
  if (!t) return "missing";
  const slots = shiurSlots(id);
  return slots && t.sourceHash === hashSlots(slots) ? "done" : "stale";
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "source") {
    const lang = asLang(rest[0]);
    for (const id of rest.slice(1)) {
      const slots = shiurSlots(id);
      if (!slots) {
        console.error(`${id}: no extraction.json + writeup.json`);
        process.exitCode = 1;
        continue;
      }
      const path = join(OUT, lang, "shiurim", `${id}.json`);
      writeJson(path, { shiurId: id, lang, sourceHash: hashSlots(slots), slots });
      const w = slots.reduce((n, s) => n + words(s.yi), 0);
      console.log(`${path}  ${slots.length} texts, ${w} Yiddish words -> write data/derived/shiurim/${id}/i18n/${lang}.json`);
    }
    return;
  }
  if (cmd === "corpus-source") {
    const lang = asLang(rest[0]);
    const si = rest.indexOf("--size");
    const size = si >= 0 ? Number(rest[si + 1]) : 40;
    const have = readCorpusTranslations(lang);
    const todo = [...corpusEntries()].filter(([e, s]) => have.hashes.get(e) !== hashSlots(s));
    const byColl = new Map<string, [string, Slot[]][]>();
    for (const [e, s] of todo) {
      const c = e.slice(0, e.indexOf(":"));
      byColl.set(c, [...(byColl.get(c) ?? []), [e, s]]);
    }
    const taken = new Set([...have.files, ...(existsSync(join(OUT, lang, "corpus")) ? readdirSync(join(OUT, lang, "corpus")) : [])]);
    let parts = 0;
    for (const [coll, list] of byColl) {
      // Stories and definitions are long; keep their parts smaller.
      const n = coll === "stories" ? Math.max(5, Math.round(size / 3)) : size;
      for (let i = 0; i < list.length; i += n) {
        let k = 1;
        let name = "";
        do name = `${coll}-${String(k++).padStart(3, "0")}.json`;
        while (taken.has(name));
        taken.add(name);
        const chunk = list.slice(i, i + n);
        writeJson(join(OUT, lang, "corpus", name), {
          lang,
          output: join(corpusTranslationDir(lang), name),
          sourceHashes: Object.fromEntries(chunk.map(([e, s]) => [e, hashSlots(s)])),
          slots: chunk.flatMap(([, s]) => s),
        });
        parts++;
      }
    }
    console.log(`${todo.length} corpus entries to translate in ${parts} part(s) under ${join(OUT, lang, "corpus")}/`);
    return;
  }
  if (cmd === "validate") {
    if (!rest.length) {
      console.error("usage: translate validate <file...>");
      process.exit(2);
    }
    process.exit(validate(rest) ? 1 : 0);
  }
  if (cmd === "status") {
    const lang = asLang(rest[0]);
    const ids = allShiurIds();
    const states = new Map(ids.map((id) => [id, shiurState(id, lang)]));
    const count = (s: string) => [...states.values()].filter((v) => v === s).length;
    if (rest.includes("--missing")) {
      let todo = ids.filter((id) => states.get(id) !== "done");
      const si = rest.indexOf("--shard");
      if (si >= 0) {
        const [k, n] = (rest[si + 1] ?? "").split("/").map(Number);
        if (!k || !n || k > n) {
          console.error("--shard k/N with 1 <= k <= N");
          process.exit(2);
        }
        // Shard over all ids, not just the missing ones, so shards stay disjoint as work completes.
        const mine = new Set(ids.filter((_, i) => i % n === k - 1));
        todo = todo.filter((id) => mine.has(id));
      }
      for (const id of todo) console.log(id);
      return;
    }
    const entries = corpusEntries();
    const have = readCorpusTranslations(lang);
    let cDone = 0;
    let cStale = 0;
    for (const [e, s] of entries) {
      const h = have.hashes.get(e);
      if (h === hashSlots(s)) cDone++;
      else if (h) cStale++;
    }
    console.log(`TRANSLATION ${lang}`);
    console.log(`  shiurim  done ${count("done")}  stale ${count("stale")}  missing ${count("missing")}  of ${ids.length}`);
    console.log(`  corpus   done ${cDone}  stale ${cStale}  missing ${entries.size - cDone - cStale}  of ${entries.size} entries (${have.files.length} part files)`);
    return;
  }
  console.error("usage: translate source|corpus-source|validate|status ... (see the header of scripts/translate.ts)");
  process.exit(2);
}

main();
