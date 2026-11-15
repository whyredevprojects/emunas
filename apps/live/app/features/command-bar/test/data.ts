/**
 * Test data for the command bar: a small corpus, its facet dictionary and a real serialized MiniSearch
 * quick index built the way W3.6 builds it (`data-build/emit.ts` `quickIndex`: the same fields, values
 * pre-folded with search-core's `foldForIndex`).
 */
import type { Ed, L } from "@emunas/corpus/public";
import { foldForIndex } from "@emunas/search-core";
import MiniSearch from "minisearch";
import {
  LIVE_DATA_SCHEMA_VERSION as V,
  type CorpusFile,
  type CorpusRow,
  type DataFetch,
  type FacetsFile,
  type QuickIndexFile,
} from "../live-data.ts";
import type { ApiResponse, ApiResult } from "../api.ts";

interface RowInput {
  id: string;
  lang: Ed;
  title: string;
  oneLiner?: L;
  parsha?: string;
  zman?: string;
  years?: number[];
  series?: { id: string; order: number };
  perek?: string;
  people?: string[];
  works?: string[];
  sections?: L[];
}

function row(r: RowInput): CorpusRow {
  return {
    id: r.id,
    rev: `rev-${r.id}`,
    lang: r.lang,
    category: r.parsha ? "parsha" : r.zman ? "zman" : r.series ? "set" : "misc",
    status: r.oneLiner ? "full" : "catalog-only",
    perek: r.perek ?? null,
    years: r.years ?? [],
    duration: 3000,
    oneLiner: r.oneLiner ?? null,
    title: r.title,
    heading: null,
    sectionTitle: "Section",
    derived: "catalog",
    parsha: r.parsha ?? null,
    zman: r.zman ?? null,
    series: r.series ?? null,
    entities: { works: r.works ?? [], people: r.people ?? [], concepts: [] },
    counts: { chapters: 0, stories: 0, questions: 0, insights: 0 },
  };
}

export const INPUT: RowInput[] = [
  {
    id: "en-parsha-noach-01",
    lang: "en",
    title: "The Holiness of the Teivah",
    oneLiner: { en: "Noach's ark as a world of tikkun.", yi: "די תיבה פון נח ווי א וועלט פון תיקון." },
    parsha: "noach",
    years: [5736],
    people: ["noach"],
    works: ["rambam"],
    sections: [{ en: "The lion ate grass", yi: "דער לייב האט געגעסן גראז" }],
  },
  {
    id: "yi-zmanim-lag-01",
    lang: "yi",
    title: "ל\"ג בעומר תשמ\"ג",
    oneLiner: { en: "Rabbi Shimon's day of joy.", yi: "רבי שמעון׳ס טאג פון שמחה." },
    zman: "lag-baomer",
    years: [5743],
  },
  { id: "yi-tanya-1-01", lang: "yi", title: "הקדמה", series: { id: "tanya-yi", order: 1 }, perek: "הקדמה" },
  {
    id: "yi-tanya-1-02",
    lang: "yi",
    title: "פרק א",
    oneLiner: { en: "Two souls.", yi: "צוויי נשמות." },
    series: { id: "tanya-yi", order: 2 },
    perek: "א",
  },
  {
    id: "yi-tanya-1-03",
    lang: "yi",
    title: "פרקים י\"א וי\"ב",
    oneLiner: { en: "The beinoni.", yi: "דער בינוני." },
    series: { id: "tanya-yi", order: 3 },
    perek: "י\"א וי\"ב",
  },
  {
    id: "en-misc-kedushah-01",
    lang: "en",
    title: "The קדושה of צדיקים",
    oneLiner: { en: "The kedushah of tzaddikim and learning lishmah.", yi: "די קדושה פון צדיקים." },
    years: [5738],
  },
];

export const CORPUS: CorpusFile = {
  schemaVersion: V,
  buildId: "test",
  counts: { total: INPUT.length, full: 5, catalogOnly: 1, downgraded: 0 },
  shiurim: INPUT.map(row),
};

const fv = (en: string, yi: string, count: number, he?: string) => ({ label: he ? { en, yi, he } : { en, yi }, count });

export const FACETS: FacetsFile = {
  schemaVersion: V,
  category: { parsha: fv("Parsha", "פרשה", 1) },
  lang: { en: fv("English", "ענגליש", 2), yi: fv("Yiddish", "אידיש", 4) },
  occasion: {
    noach: { ...fv("Noach", "נח", 1, "נח"), type: "parsha", hasPage: false },
    "lag-baomer": { ...fv("Lag BaOmer", "ל\"ג בעומר", 1, "ל\"ג בעומר"), type: "zman", hasPage: false },
  },
  year: { "5736": fv("5736", "תשל\"ו", 1), "5738": fv("5738", "תשל\"ח", 1), "5743": fv("5743", "תשמ\"ג", 1), unknown: fv("?", "?", 3) },
  series: { "tanya-yi": { ...fv("Tanya", "תניא", 3), lang: "yi" } },
  work: { rambam: fv("Rambam", "רמב\"ם", 1, "רמב\"ם") },
  person: { noach: fv("Noach", "נח", 1, "נח"), "rabbi-shimon": fv("Rabbi Shimon bar Yochai", "רבי שמעון בר יוחאי", 1) },
  concept: { "קדושה": fv("קדושה", "קדושה", 1, "קדושה") },
};

const QUICK_FIELDS = ["title", "occasion", "oneLiner", "sections", "entities"];

/** A real MiniSearch dump with the emitter's fields and folding. */
export function quickIndexFile(lang: Ed): QuickIndexFile {
  const options = { fields: [...QUICK_FIELDS], storeFields: ["name"], idField: "id" };
  const ms = new MiniSearch(options);
  const f = (xs: (string | null | undefined)[]) =>
    xs
      .flatMap((x) => (x ? [foldForIndex(x)] : []))
      .filter((x) => x.length > 0)
      .join("\n");
  ms.addAll(
    INPUT.map((r) => {
      const occ = r.parsha ? FACETS.occasion[r.parsha] : r.zman ? FACETS.occasion[r.zman] : undefined;
      return {
        id: r.id,
        name: r.title,
        title: f([r.title]),
        occasion: f(occ ? [occ.label.en, occ.label.yi, occ.label.he] : []),
        oneLiner: f([r.oneLiner?.[lang]]),
        sections: f((r.sections ?? []).map((s) => s[lang])),
        entities: f([...(r.works ?? []).map((w) => FACETS.work[w]?.label.en), ...(r.people ?? []).map((p) => FACETS.person[p]?.label.en)]),
      };
    }),
  );
  return { schemaVersion: V, lang, options, index: ms.toJSON() };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export interface DataServer {
  fetch: DataFetch;
  requests: string[];
}

/** Serves corpus/facets/quick-index (optionally a placeholder quick index); 404 for anything else. */
export function dataServer(opts: { quick?: "real" | "placeholder" | "missing" } = {}): DataServer {
  const requests: string[] = [];
  const quick = opts.quick ?? "real";
  return {
    requests,
    fetch: async (input) => {
      const path = new URL(input, "http://x.invalid").pathname;
      requests.push(path);
      if (path === "/data/corpus.json") return json(CORPUS);
      if (path === "/data/facets.json") return json(FACETS);
      const m = /^\/data\/quick-index\.(en|yi)\.json$/.exec(path);
      if (m) {
        if (quick === "missing") return json({ error: "not found" }, 404);
        if (quick === "placeholder") {
          return json({ schemaVersion: V, lang: m[1], options: { fields: ["title"], storeFields: ["title"], idField: "id" }, index: { fixture: true } });
        }
        return json(quickIndexFile(m[1] as Ed));
      }
      return json({ error: "not found" }, 404);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// API responses

export function apiResult(over: Partial<ApiResult> & Pick<ApiResult, "momentId" | "shiurId">): ApiResult {
  return {
    kind: "section",
    t: 754,
    end: 900,
    title: { en: "The lion ate grass", yi: "דער לייב האט געגעסן גראז" },
    matched: "text",
    snippet: { text: "In the Teivah even the lion ate grass.", lang: "en", marks: [[23, 27]] },
    score: 0.9,
    ...over,
  };
}

export function apiResponse(results: ApiResult[], next: string | null = null): ApiResponse {
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.shiurId, (counts.get(r.shiurId) ?? 0) + 1);
  return { rev: "r1", tookMs: 12, results, groups: [...counts].map(([shiurId, count]) => ({ shiurId, count })), next };
}

/** Planted strings that must never reach the page. */
export const PLANTED = {
  heardAs: "PLANTED-HEARDAS-ומען האט געהערט",
  asrNotes: "PLANTED-ASR-NOTE",
  transcript: "PLANTED-TRANSCRIPT-SEGMENT",
  html: "<img src=x onerror=alert(1)>",
};

/** A response body with forbidden extra keys at every level (as a misbehaving API might send). */
export function poisonedBody(): unknown {
  const r = apiResult({ momentId: "en-parsha-noach-01~s0", shiurId: "en-parsha-noach-01" });
  return {
    ...apiResponse([r]),
    transcript: PLANTED.transcript,
    results: [
      {
        ...r,
        heardAs: PLANTED.heardAs,
        asrNotes: PLANTED.asrNotes,
        text: PLANTED.transcript,
        html: PLANTED.html,
        title: { ...r.title, he: PLANTED.heardAs },
        snippet: { ...r.snippet, transcriptText: PLANTED.transcript, html: PLANTED.html },
      },
    ],
    groups: [{ shiurId: r.shiurId, count: 1, segments: [PLANTED.transcript] }],
  };
}
