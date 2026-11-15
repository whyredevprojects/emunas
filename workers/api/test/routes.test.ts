import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ALLOWED_KEYS, type HealthResponse, type SimilarResponse } from "../src/contract.ts";
import { FakeAI, FakeVectorize, call, getJson, makeEnv, migrate, seed, sortedKeys } from "./helpers.ts";

const vec = new FakeVectorize();
const e = makeEnv({ vec, ai: new FakeAI() });

beforeAll(migrate);
beforeEach(async () => {
  vec.fail = false;
  await seed(vec, undefined, "rev-routes");
});

describe("routing", () => {
  it.each(["/", "/api", "/api/searchx", "/admin", "/admin/feedback/1", "/audio/x.mp3"])("unknown path %s → JSON 404", async (path) => {
    const res = await call(e, path);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("wrong methods → 405 with Allow", async () => {
    const res = await call(e, "/api/search?q=a", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET");
    expect((await call(e, "/admin/feedback", { method: "DELETE" })).status).toBe(405);
  });

  it("internal errors are reported without detail", async () => {
    const broken = makeEnv({
      overrides: { DB_SEARCH: { prepare: () => { throw new Error("SQL secret detail"); } } as unknown as D1Database },
    });
    const res = await call(broken, "/api/search?q=a");
    expect(res.status).toBe(503);
    expect(await res.text()).toBe(JSON.stringify({ error: "unavailable" }));
  });
});

describe("GET /api/health", () => {
  it("reports rev and both backends", async () => {
    const { status, body } = await getJson<HealthResponse>(e, "/api/health");
    expect(status).toBe(200);
    expect(body).toEqual({ rev: "rev-routes", d1: "ok", vectorize: "ok" });
    expect(sortedKeys(body)).toEqual([...ALLOWED_KEYS.health]);
  });

  it("reports a Vectorize outage but stays up; a D1 outage is 503", async () => {
    vec.fail = true;
    const v = await getJson<HealthResponse>(e, "/api/health");
    expect(v.status).toBe(200);
    expect(v.body.vectorize).toBe("error");
    const broken = makeEnv({ vec, overrides: { DB_SEARCH: { prepare: () => { throw new Error("down"); } } as unknown as D1Database } });
    const d = await getJson<HealthResponse>(broken, "/api/health");
    expect(d.status).toBe(503);
    expect(d.body).toEqual({ rev: "unknown", d1: "error", vectorize: "error" });
  });
});

describe("GET /api/similar", () => {
  it("returns neighbours from other shiurim only, with allowed keys", async () => {
    const { status, body } = await getJson<SimilarResponse>(e, "/api/similar?moment=en-misc-01~tk0&limit=5");
    expect(status).toBe(200);
    expect(sortedKeys(body)).toEqual([...ALLOWED_KEYS.similar]);
    expect(body.rev).toBe("rev-routes");
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results.length).toBeLessThanOrEqual(5);
    for (const r of body.results) {
      expect(sortedKeys(r)).toEqual([...ALLOWED_KEYS.similarResult]);
      expect(r.shiurId).not.toBe("en-misc-01");
    }
    const scores = body.results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("never returns the moment itself or its own shiur", async () => {
    const { body } = await getJson<SimilarResponse>(e, "/api/similar?moment=yi-parsha-noach-01~s0&limit=50");
    for (const r of body.results) expect(r.shiurId).not.toBe("yi-parsha-noach-01");
  });

  it("404 for an unknown moment, 400 for a malformed id, empty list when the vector is missing", async () => {
    expect((await call(e, "/api/similar?moment=nope-01~s0")).status).toBe(404);
    for (const qs of ["", "?moment=../x", "?moment=a~s0&limit=99", "?moment=a~s0&x=1"]) {
      expect((await call(e, `/api/similar${qs}`)).status, qs).toBe(400);
    }
    vec.vectors.clear();
    const { status, body } = await getJson<SimilarResponse>(e, "/api/similar?moment=en-misc-01~tk0");
    expect(status).toBe(200);
    expect(body).toEqual({ rev: "rev-routes", results: [] });
  });
});
