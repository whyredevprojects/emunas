// Pick the P4 pilot set and assign benchmark arms. Deterministic: same ingest + transcripts → same file.
//
//   npx tsx scripts/pick-pilot.ts [--ingest data/derived/ingest.json] [--out data/derived/pilot-set.json]
//
// 20 in-scope shiurim with transcripts, stratified by language / category / series plus special cases
// (multi-recording, "imperfect sound", uncatalogued, short). Within a stratum candidates are ranked by
// duration preference (30-75 min, or < 20 min for the short slots), then by a seeded hash of the id.
// The "cleaned" arm goes to the imperfect-sound shiur plus the 3 Yiddish picks whose transcripts have
// the lowest share of common Yiddish words (a cheap ASR-quality proxy), computed from the committed
// transcripts in data/transcripts/.
// Then run: npm run pilot:prepare -- $(jq -r '.shiurim[].id' data/derived/pilot-set.json)
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { IngestOutput, Lang, Recording, Shiur } from "../src/types.js";
import { loadTranscript } from "./lib/pilot.js";

const SEED = "pilot-v1";
const RANGE = { min: 30, max: 75 }; // minutes
const SHORT = { min: 5, max: 20 };  // minutes, for slots that should be short (simcha)
const MIN_CHARS_PER_MIN = 150;      // transcript text per audio minute; Yiddish is typically 300-500, English ~1000

type Model = "sonnet" | "opus" | "haiku";

interface Slot {
  name: string;
  lang: Lang;
  n: number;
  filter: (s: Shiur) => boolean;
  /** Ordinary slots: one recording, human catalog row, no path notes. */
  plain?: boolean;
  short?: boolean;
  /** Field that must differ between the picks of one slot. */
  distinct?: (s: Shiur) => string | null;
}

/** "סעודת זאת חנוכה" and "חנוכה" count as the same zman for variety. */
const zmanKey = (z: string | null): string | null =>
  z === null ? null : z.replace(/^(סעודת|מסיבת)\s+/, "").replace(/^זאת\s+/, "").replace(/\s*(קטן|children|For Children|Young Bachurim)$/i, "").trim();

const OTHER_YI_SETS = new Set(["emunah-yi", "tefila-yi", "eretz-yisroel-yi", "shiurim-labachurim-yi"]);
const IMPERFECT = "imperfect sound quality";

const SLOTS: Slot[] = [
  // Yiddish (12)
  { name: "yi-parsha", lang: "yi", n: 2, plain: true, filter: (s) => s.category === "parsha", distinct: (s) => s.parsha },
  { name: "yi-zman", lang: "yi", n: 2, plain: true, filter: (s) => s.category === "zman", distinct: (s) => zmanKey(s.zman) },
  { name: "yi-shonos", lang: "yi", n: 1, plain: true, filter: (s) => s.category === "shonos" },
  { name: "yi-tanya", lang: "yi", n: 2, plain: true, filter: (s) => s.seriesId === "tanya-yi", distinct: (s) => s.perek },
  { name: "yi-other-set", lang: "yi", n: 1, plain: true, filter: (s) => OTHER_YI_SETS.has(s.seriesId ?? "") },
  // The imperfect-sound slot is necessarily a bris (both such files are), so take a bar mitzvah here for variety.
  {
    name: "yi-simcha",
    lang: "yi",
    n: 1,
    short: true,
    filter: (s) => s.category === "simcha" && s.id.includes("bar-mitzvah") && s.recordingIds.length === 1 && !s.pathNotes.length,
  },
  { name: "yi-multi-recording", lang: "yi", n: 1, filter: (s) => s.recordingIds.length > 1 },
  { name: "yi-imperfect-sound", lang: "yi", n: 1, short: true, filter: (s) => s.pathNotes.includes(IMPERFECT) },
  {
    name: "yi-uncatalogued",
    lang: "yi",
    n: 1,
    filter: (s) => s.catalog.derived !== "catalog" && s.category !== "simcha" && s.recordingIds.length === 1 && !s.pathNotes.length,
  },
  // English (8)
  { name: "en-parsha", lang: "en", n: 2, plain: true, filter: (s) => s.category === "parsha", distinct: (s) => s.parsha },
  { name: "en-zman", lang: "en", n: 2, plain: true, filter: (s) => s.category === "zman", distinct: (s) => zmanKey(s.zman) },
  { name: "en-tanya", lang: "en", n: 2, plain: true, filter: (s) => s.seriesId === "tanya-en", distinct: (s) => s.perek },
  { name: "en-emunah", lang: "en", n: 1, plain: true, filter: (s) => s.seriesId === "emunah-en" },
  { name: "en-tefila-or-misc", lang: "en", n: 1, plain: true, filter: (s) => s.seriesId === "tefila-en" || s.category === "misc" },
];

// Benchmark arms, by slot pick ("<slot>#<i>"). Every shiur gets extraction "sonnet" and write-up "opus".
const EXTRA_EXTRACTION: Record<Exclude<Model, "sonnet">, string[]> = {
  opus: ["yi-parsha#0", "yi-zman#0", "yi-tanya#0", "yi-multi-recording#0", "en-parsha#0", "en-zman#0", "en-tanya#0", "en-emunah#0"],
  haiku: ["yi-parsha#0", "yi-tanya#0", "en-parsha#0", "en-tanya#0"],
};
const EXTRA_WRITEUP_SONNET = ["yi-parsha#1", "yi-zman#1", "yi-other-set#0", "en-parsha#1", "en-zman#1", "en-tanya#1"];
const CLEANED_N = 4;

// Frequent Yiddish function words and very common words/terms, in Chassidish spelling. A transcript whose
// tokens are rarely in this list is mostly garbled. Only the ranking among the picks matters.
const COMMON_YI = new Set(
  `די דער דאס דעם א אן און איז עס ער זי זיי מיר מען איך דו איר ס'איז ס'האט ס'וועט ס'קומט מ'האט מ'קען מ'דארף מ'זאגט
  וואס ווי אזוי אויב אז אבער ווייל נישט ניט קיין יא נאר נאך שוין אויך אלץ אלע אלעס גאר זייער זיך זיין זיינע זייערע
  האט האבן האב האסט זענען געווען געווארן ווערט ווערן וועט וועלן וועל קען קענען קומט קומען גייט גיין געגאנגען
  זאגט זאגן געזאגט דא דארט דארף דארפן מוז מוזן זאל זאלן וויל ווילן ווען ווער פארוואס וועגן פון פונעם צו צום
  מיט מיט'ן אין אינעם אויף אויפן ביי בייא פאר פארן נאכן איבער אונטער ארויס אריין אוועק צוריק אנדערע אנדערש
  איין איינער איינע אייניגע צוויי דריי מער ווייניג גאנצע גאנצן גאנץ גוט גוטע גרויס גרויסע קליין יעדע יעדער יעדן
  אזא אזעלכע אזויפיל אסאך אביסל ביסל עפעס היינט יאר טאג מאל אמאל דאך אפילו ממש היינו יעצט דעמאלט דערנאך
  דערפאר דעריבער טאקע ביז אדער כאטש וואו מיין אונזער אונזערע אונז אים זאך זאכן מענטש מענטשן איד אידן
  הייסט מיינט מיינען וויסן ווייסט ווייס ערשטע לעצטע ווארט ווערטער האלט האלטן גיט געבן געגעבן געמאכט מאכט מאכן
  געהאט זען זעט געזען וואלט וואלטן ברענגט רעדט לערנט דאס'איז אלס זעלבע אזוינע
  השם אמונה תורה שבת קודש ברוך הוא הקב"ה רבונו של עולם הזה הבא חז"ל רש"י גמרא פסוק מצוה מצות תפילה כביכול
  עבודה צדיק צדיקים יום טוב נשמה גוף ישראל כלל ה' ית' לכאורה ממילא דוקא`.split(/\s+/),
);

function hashRank(id: string): string {
  return createHash("sha256").update(`${SEED}:${id}`).digest("hex");
}

/** Share of tokens (Hebrew-script or not) that are common Yiddish words. */
function commonWordShare(texts: string[]): number {
  let all = 0;
  let common = 0;
  for (const t of texts) {
    for (const raw of t.split(/\s+/)) {
      const w = raw.replace(/^[^\p{L}]+|[^\p{L}'"״׳]+$/gu, "").replace(/["״]$/, "");
      if (!w) continue;
      all++;
      if (COMMON_YI.has(w)) common++;
    }
  }
  return all ? common / all : 0;
}

function parseArgs(argv: string[]): { ingest: string; out: string } {
  let ingest = "data/derived/ingest.json";
  let out = "data/derived/pilot-set.json";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--ingest") ingest = argv[++i] ?? ingest;
    else if (a === "--out") out = argv[++i] ?? out;
    else throw new Error(`unknown argument ${a}`);
  }
  return { ingest, out };
}

function main(): void {
  const { ingest: ingestPath, out } = parseArgs(process.argv.slice(2));
  const ingest = JSON.parse(readFileSync(ingestPath, "utf8")) as IngestOutput;
  const recById = new Map<string, Recording>(ingest.recordings.map((r) => [r.id, r]));
  const recs = (s: Shiur) => s.recordingIds.map((id) => recById.get(id)!);
  const minutes = (s: Shiur) => recs(s).reduce((a, r) => a + (r.durationSec ?? 0), 0) / 60;

  const pool = ingest.shiurim.filter(
    (s) =>
      s.inScope &&
      s.recordingIds.length > 0 &&
      recs(s).every((r) => r && r.transcriptKey && r.durationSec && !r.duplicateOf && !r.partOf),
  );

  // Skip near-empty transcripts (ASR dropped most of the audio): useless for comparing models.
  const density = new Map<string, number>();
  const charsPerMin = (s: Shiur): number => {
    let v = density.get(s.id);
    if (v === undefined) {
      const chars = recs(s).reduce((a, r) => a + loadTranscript(r.id).segments.reduce((b, x) => b + x.text.length, 0), 0);
      v = chars / Math.max(1, minutes(s));
      density.set(s.id, v);
    }
    return v;
  };

  const taken = new Set<string>();
  const picks: { shiur: Shiur; slot: string; pick: string }[] = [];
  for (const slot of SLOTS) {
    const range = slot.short ? SHORT : RANGE;
    const dist = (m: number) => (m < range.min ? range.min - m : m > range.max ? m - range.max : 0);
    const cands = pool
      .filter((s) => s.lang === slot.lang && !taken.has(s.id) && slot.filter(s))
      .filter((s) => !slot.plain || (s.recordingIds.length === 1 && s.catalog.derived === "catalog" && !s.pathNotes.length))
      .filter((s) => charsPerMin(s) >= MIN_CHARS_PER_MIN)
      .map((s) => ({ s, d: dist(minutes(s)), h: hashRank(s.id) }))
      .sort((a, b) => a.d - b.d || (a.h < b.h ? -1 : a.h > b.h ? 1 : 0));
    const seen = new Set<string>();
    let got = 0;
    for (const { s } of cands) {
      if (got === slot.n) break;
      const key = slot.distinct?.(s) ?? null;
      if (key !== null && seen.has(key)) continue;
      if (key !== null) seen.add(key);
      taken.add(s.id);
      picks.push({ shiur: s, slot: slot.name, pick: `${slot.name}#${got}` });
      got++;
    }
    if (got < slot.n) throw new Error(`slot ${slot.name}: only ${got}/${slot.n} candidates`);
  }

  // ASR-quality proxy for the Yiddish picks.
  const share = new Map<string, number>();
  for (const { shiur } of picks.filter((p) => p.shiur.lang === "yi")) {
    const texts: string[] = [];
    for (const r of recs(shiur)) texts.push(...loadTranscript(r.id).segments.map((x) => x.text));
    share.set(shiur.id, Number(commonWordShare(texts).toFixed(3)));
  }
  const imperfect = picks.find((p) => p.slot === "yi-imperfect-sound")!.shiur.id;
  const worst = [...share.entries()]
    .filter(([id]) => id !== imperfect)
    .sort((a, b) => a[1] - b[1] || (hashRank(a[0]) < hashRank(b[0]) ? -1 : 1))
    .slice(0, CLEANED_N - 1)
    .map(([id]) => id);
  const cleaned = new Set([imperfect, ...worst]);

  const shiurim = picks.map(({ shiur: s, slot, pick }) => {
    const extraction: Model[] = ["sonnet"];
    if (EXTRA_EXTRACTION.opus.includes(pick)) extraction.push("opus");
    if (EXTRA_EXTRACTION.haiku.includes(pick)) extraction.push("haiku");
    const writeup: Model[] = ["opus"];
    if (EXTRA_WRITEUP_SONNET.includes(pick)) writeup.push("sonnet");
    const input = cleaned.has(s.id) ? ["raw", "cleaned"] : ["raw"];

    // Planned runs; paths relative to out/pilot/<id>/. Write-ups are built on the sonnet-raw extraction.
    const runs: Record<string, string>[] = [];
    if (input.includes("cleaned")) {
      runs.push({ pass: "p3", model: "sonnet", prompt: "prompts/p3-cleanup.md", input: "input.txt", output: "input.cleaned.txt" });
    }
    for (const m of extraction) {
      runs.push({ pass: "p4", model: m, variant: "raw", prompt: "prompts/p4-extract.md", input: "input.txt", output: `${m}-raw.json` });
    }
    if (input.includes("cleaned")) {
      runs.push({ pass: "p4", model: "sonnet", variant: "cleaned", prompt: "prompts/p4-extract.md", input: "input.cleaned.txt", output: "sonnet-cleaned.json" });
    }
    for (const m of writeup) {
      runs.push({
        pass: "p4b", model: m, variant: "raw", prompt: "prompts/p4b-writeup.md", input: "input.txt",
        extraction: "sonnet-raw.json", extractionVariant: "sonnet-raw", output: `writeup-${m}.json`,
      });
    }
    // Pairwise judge comparisons (prompts/judge.md), sonnet-raw / writeup-opus being the baselines.
    const compare: [string, string][] = [
      ...extraction.filter((m) => m !== "sonnet").map((m): [string, string] => [`${m}-raw.json`, "sonnet-raw.json"]),
      ...(input.includes("cleaned") ? [["sonnet-cleaned.json", "sonnet-raw.json"] as [string, string]] : []),
      ...writeup.filter((m) => m !== "opus").map((m): [string, string] => [`writeup-${m}.json`, "writeup-opus.json"]),
    ];

    return {
      id: s.id,
      slot,
      lang: s.lang,
      category: s.category,
      seriesId: s.seriesId,
      catalogTitle: s.catalog.titleOriginal,
      catalogDerived: s.catalog.derived,
      parsha: s.parsha,
      zman: s.zman,
      perek: s.perek,
      recordings: s.recordingIds.length,
      durationMin: Number(minutes(s).toFixed(1)),
      transcriptCharsPerMin: Math.round(charsPerMin(s)),
      pathNotes: s.pathNotes,
      asrCommonWordShare: share.get(s.id) ?? null,
      arms: { extraction, input, writeup },
      runs,
      compare,
    };
  });

  const count = (f: (x: (typeof shiurim)[number]) => boolean) => shiurim.filter(f).length;
  const result = {
    seed: SEED,
    ingest: ingestPath,
    criteria: {
      durationPreferMin: RANGE,
      shortSlotsMin: SHORT,
      minTranscriptCharsPerMin: MIN_CHARS_PER_MIN,
      slots: SLOTS.map((s) => ({ name: s.name, lang: s.lang, n: s.n })),
      cleaned: `"${IMPERFECT}" pick + the ${CLEANED_N - 1} other Yiddish picks with the lowest asrCommonWordShare`,
      files: "out/pilot/<id>/: extraction <model>-<input>.json, write-up writeup-<model>.json (on sonnet-raw.json)",
    },
    totals: {
      shiurim: shiurim.length,
      yi: count((x) => x.lang === "yi"),
      en: count((x) => x.lang === "en"),
      extractionOpus: count((x) => x.arms.extraction.includes("opus")),
      extractionHaiku: count((x) => x.arms.extraction.includes("haiku")),
      cleaned: count((x) => x.arms.input.includes("cleaned")),
      writeupSonnet: count((x) => x.arms.writeup.includes("sonnet")),
      hours: Number((shiurim.reduce((a, x) => a + x.durationMin, 0) / 60).toFixed(2)),
    },
    shiurim,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(result, null, 1) + "\n");
  for (const x of shiurim) {
    const arms = [x.arms.extraction.join("+"), x.arms.input.includes("cleaned") ? "cleaned" : "", `wu:${x.arms.writeup.join("+")}`].filter(Boolean).join(" ");
    console.log(`${x.id.padEnd(48)} ${x.slot.padEnd(20)} ${String(x.durationMin).padStart(6)}m  ${arms}${x.asrCommonWordShare !== null ? `  common=${x.asrCommonWordShare}` : ""}`);
  }
  console.log(JSON.stringify(result.totals));
  console.log(`wrote ${out}`);
}

main();
