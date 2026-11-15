import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { foldTokens } from "@emunas/normalize/fold";
import worker from "../src/index.ts";
import type { EmbeddingModel, Env, VectorIndex } from "../src/env.ts";
import { vectorIdFor, type Kind, type Lang } from "../src/contract.ts";

export const ctx = {
  waitUntil: (p: Promise<unknown>) => {
    pending.push(p);
  },
  passThroughOnException: () => {},
  props: {},
} as unknown as ExecutionContext;
const pending: Promise<unknown>[] = [];

export async function flushWaitUntil(): Promise<void> {
  await Promise.all(pending.splice(0));
}

export async function migrate(): Promise<void> {
  await applyD1Migrations(env.DB_SEARCH, env.TEST_SEARCH_MIGRATIONS);
  await applyD1Migrations(env.DB_FEEDBACK, env.TEST_FEEDBACK_MIGRATIONS);
}

// ---------------------------------------------------------------------------------------------
// Fake Workers AI + Vectorize. Embedding = normalized bag of folded character trigrams in 64
// dims, so texts sharing words are close. Good enough to exercise the hybrid path.
// ---------------------------------------------------------------------------------------------

const DIMS = 64;

export function fakeEmbed(text: string): number[] {
  const v = new Array<number>(DIMS).fill(0);
  for (const tok of foldTokens(text)) {
    const padded = ` ${tok} `;
    for (let i = 0; i + 3 <= padded.length; i++) {
      let h = 0;
      for (const ch of padded.slice(i, i + 3)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
      v[h % DIMS] = (v[h % DIMS] ?? 0) + 1;
    }
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

export class FakeAI implements EmbeddingModel {
  calls: { model: string; text: string[] }[] = [];
  fail = false;
  async run(model: string, inputs: { text: string[] }): Promise<unknown> {
    this.calls.push({ model, text: inputs.text });
    if (this.fail) throw new Error("AI down");
    return { shape: [inputs.text.length, DIMS], data: inputs.text.map(fakeEmbed) };
  }
}

type Meta = Record<string, string | number | boolean>;

function matchesFilter(meta: Meta, filter: VectorizeVectorMetadataFilter | undefined): boolean {
  if (!filter) return true;
  for (const [field, cond] of Object.entries(filter)) {
    const value = meta[field];
    if (cond === null || typeof cond !== "object") {
      if (value !== cond) return false;
      continue;
    }
    const c = cond as Record<string, unknown>;
    if ("$eq" in c && value !== c["$eq"]) return false;
    if ("$in" in c && !(c["$in"] as unknown[]).includes(value)) return false;
    if ("$gte" in c && !(typeof value === "number" && value >= (c["$gte"] as number))) return false;
    if ("$lte" in c && !(typeof value === "number" && value <= (c["$lte"] as number))) return false;
  }
  return true;
}

export class FakeVectorize implements VectorIndex {
  vectors = new Map<string, { values: number[]; metadata: Meta }>();
  queries: { topK: number | undefined; filter: VectorizeVectorMetadataFilter | undefined }[] = [];
  fail = false;

  async query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    if (this.fail) throw new Error("vectorize down");
    this.queries.push({ topK: options?.topK, filter: options?.filter });
    const scored = [...this.vectors]
      .filter(([, v]) => matchesFilter(v.metadata, options?.filter))
      .map(([id, v]) => ({ id, score: v.values.reduce((s, x, i) => s + x * (vector[i] ?? 0), 0), metadata: v.metadata }))
      .filter((m) => m.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, options?.topK ?? 5);
    // The real binding returns metadata when asked; return it always so tests prove it is not passed on.
    return { matches: scored, count: scored.length };
  }

  async queryById(vectorId: string, options?: VectorizeQueryOptions): Promise<VectorizeMatches> {
    const v = this.vectors.get(vectorId);
    if (!v) throw new Error("vector not found");
    return this.query(v.values, options);
  }

  async describe(): Promise<unknown> {
    if (this.fail) throw new Error("vectorize down");
    return { vectorCount: this.vectors.size, dimensions: DIMS };
  }
}

// ---------------------------------------------------------------------------------------------
// Seed data: what W3.10 will write (moments, entities, display text, folded FTS rows, meta).
// ---------------------------------------------------------------------------------------------

export interface SeedMoment {
  id: string;
  shiurId: string;
  kind: Kind;
  t: number;
  end?: number;
  audioLang: Lang;
  category: string;
  occasion?: string;
  series?: string;
  year?: number;
  catalogued?: boolean;
  confidence?: number;
  titleEn?: string;
  titleYi?: string;
  hash?: string;
  text: Partial<Record<Lang, { title?: string; body: string }>>;
  /** Extra search-form text written only to the FTS rows (never displayed). */
  ftsExtra?: string;
  entities?: { type: "work" | "person" | "concept"; id: string }[];
  /** Write vectors for this moment (default true). */
  vector?: boolean;
  vectorMeta?: Meta;
}

export const PLANTED = "PLANTEDASRSECRET";

export const MOMENTS: SeedMoment[] = [
  {
    id: "yi-parsha-noach-01~s0",
    shiurId: "yi-parsha-noach-01",
    kind: "section",
    t: 0,
    end: 300,
    audioLang: "yi",
    category: "parsha",
    occasion: "noach",
    year: 5743,
    catalogued: true,
    titleEn: "The Flood and trust",
    titleYi: "דער מבול און בטחון",
    text: {
      en: { title: "The Flood and trust", body: "Noach built the ark with complete trust in Hashem while the world laughed." },
      yi: { title: "דער מבול און בטחון", body: "נח האט געבויט די תבה מיט פולן בטחון אין השם." },
    },
    entities: [{ type: "work", id: "bereishis" }],
  },
  {
    id: "yi-parsha-noach-01~i0",
    shiurId: "yi-parsha-noach-01",
    kind: "insight",
    t: 120,
    end: 180,
    audioLang: "yi",
    category: "parsha",
    occasion: "noach",
    year: 5743,
    catalogued: true,
    titleEn: "Learning Torah in a flood",
    titleYi: "לערנען אין א מבול",
    text: {
      yi: { body: "מען דארף זיך האלטן בתורה אפילו ווען די וועלט איז א מבול." },
      en: { body: "One must hold on to Torah even when the world is a flood." },
    },
    entities: [{ type: "work", id: "bereishis" }, { type: "concept", id: "bitachon" }],
  },
  {
    id: "en-zman-lag-baomer-01~s0",
    shiurId: "en-zman-lag-baomer-01",
    kind: "section",
    t: 10,
    end: 400,
    audioLang: "en",
    category: "zman",
    occasion: "lag-baomer",
    year: 5760,
    catalogued: true,
    titleEn: "Lag BaOmer and the Zohar",
    titleYi: "ל\"ג בעומר און דער זוהר",
    text: {
      en: { title: "Lag BaOmer and the Zohar", body: "On Lag BaOmer we celebrate Rabbi Shimon bar Yochai and the light of the Zohar." },
      yi: { title: "ל\"ג בעומר און דער זוהר", body: "ל\"ג בעומר פייערט מען רבי שמעון בר יוחאי און דאס ליכט פון זוהר." },
    },
    entities: [{ type: "person", id: "rashbi" }, { type: "concept", id: "simcha" }],
  },
  {
    id: "en-zman-lag-baomer-01~st0",
    shiurId: "en-zman-lag-baomer-01",
    kind: "story",
    t: 200,
    audioLang: "en",
    category: "zman",
    occasion: "lag-baomer",
    year: 5760,
    catalogued: true,
    titleEn: "A story in Meron",
    text: {
      en: {
        body:
          "Many years ago a group of chassidim walked to Meron for the hilula. " +
          "On the way they met a poor man who asked for bread, and they gave him everything they had. " +
          "When they arrived the Rebbe told them that their trust and their kindness on the road was the real celebration of the day, " +
          "more than any fire that was lit on the mountain that night.",
      },
    },
  },
  {
    id: "en-misc-01~tk0",
    shiurId: "en-misc-01",
    kind: "takeaway",
    t: 50,
    audioLang: "en",
    category: "misc",
    catalogued: false,
    confidence: 0.65,
    titleEn: "Trust is daily work",
    text: { en: { body: "Trust in Hashem has to be worked on every single day." } },
  },
  {
    // Planted: transcript-like strings in columns that are never returned.
    id: "yi-zmanim-planted-01~q0",
    shiurId: "yi-zmanim-planted-01",
    kind: "question",
    t: 30,
    audioLang: "yi",
    category: "zman",
    occasion: "purim",
    year: 5750,
    catalogued: true,
    titleEn: "Why do we rejoice on Purim",
    titleYi: "פארוואס פרייט מען זיך פורים",
    hash: `heardAs:${PLANTED}`,
    text: { en: { body: "Why do we rejoice on Purim more than on other days?" } },
    ftsExtra: `${PLANTED} heardAs asrNotes`,
    entities: [{ type: "concept", id: `heardas-${PLANTED.toLowerCase()}` }],
    vectorMeta: { heardAs: PLANTED, asrNotes: PLANTED },
  },
];

const searchForm = (s: string | undefined) => (s === undefined ? "" : foldTokens(s).join(" "));

export async function seed(vec: FakeVectorize, moments: readonly SeedMoment[] = MOMENTS, rev = "rev-1"): Promise<void> {
  const db = env.DB_SEARCH;
  const stmts: D1PreparedStatement[] = [
    db.prepare("DELETE FROM moments"),
    db.prepare("DELETE FROM moment_entities"),
    db.prepare("DELETE FROM moment_text"),
    db.prepare("DELETE FROM fts_words"),
    db.prepare("DELETE FROM fts_tri"),
    db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('corpus_rev', ?)").bind(rev),
    db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('heardAs', ?)").bind(PLANTED),
  ];
  vec.vectors.clear();
  for (const m of moments) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO moments (id, shiur_id, kind, t, end_t, audio_lang, category, occasion, series, year, catalogued, confidence, title_en, title_yi, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          m.id, m.shiurId, m.kind, m.t, m.end ?? null, m.audioLang, m.category, m.occasion ?? null, m.series ?? null,
          m.year ?? null, m.catalogued ? 1 : 0, m.confidence ?? null, m.titleEn ?? null, m.titleYi ?? null, m.hash ?? `h-${m.id}`,
        ),
    );
    for (const e of m.entities ?? []) {
      stmts.push(db.prepare("INSERT INTO moment_entities (moment_id, type, entity_id) VALUES (?, ?, ?)").bind(m.id, e.type, e.id));
    }
    for (const lang of ["en", "yi"] as const) {
      const t = m.text[lang];
      if (!t) continue;
      stmts.push(db.prepare("INSERT INTO moment_text (id, lang, title, body) VALUES (?, ?, ?, ?)").bind(m.id, lang, t.title ?? null, t.body));
      const title = searchForm(t.title ?? (lang === "en" ? m.titleEn : m.titleYi));
      const body = [searchForm(t.body), searchForm(m.ftsExtra)].filter((s) => s.length > 0).join(" ");
      for (const table of ["fts_words", "fts_tri"]) {
        stmts.push(db.prepare(`INSERT INTO ${table} (id, lang, title, body) VALUES (?, ?, ?, ?)`).bind(m.id, lang, title, body));
      }
      if (m.vector !== false) {
        vec.vectors.set(vectorIdFor(m.id, lang), {
          values: fakeEmbed(`${t.title ?? ""} ${t.body}`),
          metadata: {
            shiurId: m.shiurId,
            t: m.t,
            hash: m.hash ?? `h-${m.id}`,
            audio_lang: m.audioLang,
            kind: m.kind,
            category: m.category,
            ...(m.year !== undefined ? { year: m.year } : {}),
            ...(m.vectorMeta ?? {}),
          },
        });
      }
    }
  }
  await db.batch(stmts);
}

export interface TestEnvOptions {
  vec?: FakeVectorize;
  ai?: FakeAI;
  rate?: Env["RATE"];
  overrides?: Partial<Env>;
}

export function makeEnv(o: TestEnvOptions = {}): Env {
  return {
    DB_SEARCH: env.DB_SEARCH,
    DB_FEEDBACK: env.DB_FEEDBACK,
    VEC: o.vec ?? new FakeVectorize(),
    AI: o.ai ?? new FakeAI(),
    RATE: o.rate ?? { limit: async () => ({ success: true }) },
    TURNSTILE_SECRET: env.TURNSTILE_SECRET,
    FEEDBACK_HASH_SALT: env.FEEDBACK_HASH_SALT,
    ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN,
    ACCESS_AUD: env.ACCESS_AUD,
    ...o.overrides,
  };
}

let ipCounter = 0;
/** A fresh client address per call, so the real rate limiter does not interfere unless wanted. */
export function freshIp(): string {
  ipCounter++;
  return `203.0.113.${ipCounter % 250}-${ipCounter}`;
}

export async function call(e: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", freshIp());
  return worker.fetch(new Request(`https://api.internal${path}`, { ...init, headers }), e, ctx);
}

export async function getJson<T = unknown>(e: Env, path: string, init: RequestInit = {}): Promise<{ status: number; body: T; res: Response; text: string }> {
  const res = await call(e, path, init);
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as T, res, text };
}

/** Recursively collect every object key path's key set by role, for key-allow-list checks. */
export function sortedKeys(o: object): string[] {
  return Object.keys(o).sort();
}
