import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

describe("emunas-api skeleton", () => {
  it.each(["/", "/api/search?q=x", "/admin/feedback"])("answers %s with a JSON 404", async (path) => {
    const res = await worker.fetch(new Request(`https://api.internal${path}`), {}, ctx);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
