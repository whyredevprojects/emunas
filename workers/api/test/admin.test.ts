import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_KEYS, type FeedbackRow } from "../src/contract.ts";
import { resetAccessCache } from "../src/access.ts";
import { csvCell } from "../src/admin.ts";
import { call, makeEnv, migrate, sortedKeys } from "./helpers.ts";

const TEAM = "https://emunas-test.cloudflareaccess.com";
const AUD = "test-aud";
const e = makeEnv();

let keyPair: CryptoKeyPair;
let otherPair: CryptoKeyPair;
let jwk: JsonWebKey;
let certFetches = 0;

function b64url(bytes: Uint8Array | string): string {
  const b = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const x of b) bin += String.fromCharCode(x);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sign(payload: Record<string, unknown>, key: CryptoKey = keyPair.privateKey, kid = "k1", alg = "RS256"): Promise<string> {
  const head = b64url(JSON.stringify({ alg, kid, typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

const now = () => Math.floor(Date.now() / 1000);
const goodClaims = () => ({ aud: [AUD], iss: TEAM, exp: now() + 300, iat: now(), email: "owner@example.test" });

beforeAll(async () => {
  await migrate();
  const algo = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
  keyPair = (await crypto.subtle.generateKey(algo, true, ["sign", "verify"])) as CryptoKeyPair;
  otherPair = (await crypto.subtle.generateKey(algo, true, ["sign", "verify"])) as CryptoKeyPair;
  jwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey;
});

beforeEach(async () => {
  resetAccessCache();
  certFetches = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (...args: Parameters<typeof fetch>) => {
    const req = new Request(...args);
    if (req.url === `${TEAM}/cdn-cgi/access/certs`) {
      certFetches++;
      return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "RS256", use: "sig" }] });
    }
    return new Response("unexpected", { status: 500 });
  });
  await env.DB_FEEDBACK.prepare("DELETE FROM feedback").run();
  await env.DB_FEEDBACK.batch([
    env.DB_FEEDBACK.prepare(
      "INSERT INTO feedback (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status) VALUES ('f1', '2026-11-01T10:00:00.000Z', 'yi-parsha-noach-01', 'yi-parsha-noach-01~s0', 'source', 'wrong-source', 'Wrong pasuk, \"6:8\"', 'en', 'rev-1', 'secret-hash', 'open')",
    ),
    env.DB_FEEDBACK.prepare(
      "INSERT INTO feedback (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status) VALUES ('f2', '2026-11-02T10:00:00.000Z', 'en-misc-01', NULL, NULL, 'other', '=HYPERLINK(\"x\")', 'yi', 'rev-1', 'secret-hash', 'open')",
    ),
    env.DB_FEEDBACK.prepare(
      "INSERT INTO feedback (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, ua_hash, status) VALUES ('f3', '2026-11-03T10:00:00.000Z', 'en-misc-01', NULL, NULL, 'other', NULL, 'en', 'rev-1', 'secret-hash', 'done')",
    ),
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const admin = (qs = "", token?: string) =>
  call(e, `/admin/feedback${qs}`, token === undefined ? {} : { headers: { "cf-access-jwt-assertion": token } });

describe("GET /admin/feedback (Cloudflare Access)", () => {
  it("rejects a request without the Access header", async () => {
    const res = await admin();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("rejects forged, foreign, expired, wrong-audience and wrong-issuer tokens", async () => {
    const cases = [
      "not-a-jwt",
      "a.b.c",
      await sign(goodClaims(), otherPair.privateKey),
      await sign(goodClaims(), keyPair.privateKey, "unknown-kid"),
      await sign(goodClaims(), keyPair.privateKey, "k1", "none"),
      await sign({ ...goodClaims(), exp: now() - 10 }),
      await sign({ ...goodClaims(), aud: ["someone-else"] }),
      await sign({ ...goodClaims(), iss: "https://evil.cloudflareaccess.com" }),
    ];
    for (const token of cases) {
      const res = await admin("", token);
      expect(res.status, token.slice(0, 20)).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    }
  });

  it("fails closed when Access is not configured", async () => {
    const unconfigured = makeEnv({ overrides: { ACCESS_AUD: "" } });
    const res = await call(unconfigured, "/admin/feedback", { headers: { "cf-access-jwt-assertion": await sign(goodClaims()) } });
    expect(res.status).toBe(403);
  });

  it("lists open reports as JSON with the allowed keys only (no UA hash)", async () => {
    const res = await admin("", await sign(goodClaims()));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret-hash");
    const body = JSON.parse(text) as { items: FeedbackRow[] };
    expect(sortedKeys(body)).toEqual([...ALLOWED_KEYS.adminList]);
    expect(body.items.map((r) => r.id)).toEqual(["f2", "f1"]);
    for (const r of body.items) expect(sortedKeys(r)).toEqual([...ALLOWED_KEYS.feedbackRow]);
    const all = (await (await admin("?status=all", await sign(goodClaims()))).json()) as { items: FeedbackRow[] };
    expect(all.items.map((r) => r.id)).toEqual(["f3", "f2", "f1"]);
    expect(certFetches).toBe(1); // certs cached between requests
  });

  it("exports CSV with quoting and formula protection", async () => {
    const res = await admin("?format=csv&status=all", await sign(goodClaims()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const lines = (await res.text()).trimEnd().split("\r\n");
    expect(lines[0]).toBe("id,createdAt,shiurId,momentId,field,reason,text,ui,rev,status");
    expect(lines).toHaveLength(4);
    expect(lines).toContain('f1,2026-11-01T10:00:00.000Z,yi-parsha-noach-01,yi-parsha-noach-01~s0,source,wrong-source,"Wrong pasuk, ""6:8""",en,rev-1,open');
    expect(lines).toContain(`f2,2026-11-02T10:00:00.000Z,en-misc-01,,,other,"'=HYPERLINK(""x"")",yi,rev-1,open`);
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(null)).toBe("");
  });

  it("validates its parameters", async () => {
    const token = await sign(goodClaims());
    for (const qs of ["?status=weird", "?format=xml", "?limit=0", "?limit=abc", "?extra=1"]) {
      expect((await admin(qs, token)).status, qs).toBe(400);
    }
  });
});
