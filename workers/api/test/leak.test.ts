/**
 * Acceptance: a planted heardAs-like string seeded into columns that are never returned
 * (moments.hash, unknown keys of moments.titles, moment_entities.entity_id, meta, the FTS search
 * form, Vectorize metadata) does
 * not appear in any response, even when the planted moment itself is a hit.
 */
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { UI_LANGS } from "@emunas/i18n";
import { FakeAI, FakeVectorize, PLANTED, call, makeEnv, migrate, seed } from "./helpers.ts";
import type { SearchResponse } from "../src/contract.ts";

const vec = new FakeVectorize();
const e = makeEnv({ vec, ai: new FakeAI() });
const FORBIDDEN = [PLANTED.toLowerCase(), "heardas", "asrnotes"];

beforeAll(async () => {
  await migrate();
  await seed(vec, undefined, "rev-leak");
});

async function bodyOf(path: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  const res = await call(e, path, init);
  return { status: res.status, text: await res.text() };
}

function expectClean(text: string, label: string): void {
  const lower = text.toLowerCase();
  for (const f of FORBIDDEN) expect(lower.includes(f), `${label} leaks ${f}`).toBe(false);
}

describe("planted transcript-like strings never reach a response", () => {
  it("the planted moment is found by its search form, but nothing planted is returned", async () => {
    for (const mode of ["lexical", "hybrid", "semantic"]) {
      for (const q of [PLANTED, "heardAs", "asrNotes", "purim"]) {
        for (const ui of UI_LANGS) {
          const { status, text } = await bodyOf(`/api/search?q=${encodeURIComponent(q)}&mode=${mode}&ui=${ui}`);
          expect(status).toBe(200);
          expectClean(text, `search ${mode} ${q} ${ui}`);
        }
      }
    }
    const hit = JSON.parse((await bodyOf(`/api/search?q=${PLANTED}&mode=lexical`)).text) as SearchResponse;
    expect(hit.results.map((r) => r.momentId)).toEqual(["yi-zmanim-planted-01~q0"]);
    expect(hit.results[0]?.snippet?.text).toBe("Why do we rejoice on Purim more than on other days?");
    // The planted keys and the non-string he value in its titles column are dropped.
    expect(hit.results[0]?.title).toEqual({ en: "Why do we rejoice on Purim", yi: "פארוואס פרייט מען זיך פורים", he: null });
  });

  it("filters, similar, health and errors are clean too", async () => {
    const paths = [
      `/api/search?q=purim&concept=heardas-${PLANTED.toLowerCase()}`,
      "/api/search?q=purim&mode=hybrid&ui=yi&audio=yi",
      "/api/similar?moment=yi-zmanim-planted-01~q0",
      "/api/similar?moment=yi-parsha-noach-01~s0&limit=50",
      "/api/health",
      `/api/search?q=a&${PLANTED}=1`,
      `/api/nope/${PLANTED}`,
    ];
    for (const p of paths) {
      const { text } = await bodyOf(p);
      expectClean(text, p);
    }
  });

  it("the planted values really are in D1 (the test would be vacuous otherwise)", async () => {
    const row = await env.DB_SEARCH.prepare("SELECT hash FROM moments WHERE id = 'yi-zmanim-planted-01~q0'").first<{ hash: string }>();
    expect(row?.hash).toContain(PLANTED);
    const fts = await env.DB_SEARCH.prepare("SELECT count(*) AS n FROM fts_words WHERE fts_words MATCH ?").bind(`"${PLANTED.toLowerCase()}"`).first<{ n: number }>();
    expect(fts?.n).toBeGreaterThan(0);
    const titles = await env.DB_SEARCH.prepare("SELECT titles FROM moments WHERE id = 'yi-zmanim-planted-01~q0'").first<{ titles: string }>();
    expect(titles?.titles).toContain(PLANTED);
    const meta = await env.DB_SEARCH.prepare("SELECT v FROM meta WHERE k = 'heardAs'").first<{ v: string }>();
    expect(meta?.v).toBe(PLANTED);
  });
});
