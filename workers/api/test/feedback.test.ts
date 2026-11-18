import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_KEYS } from "../src/contract.ts";
import { SITEVERIFY_URL } from "../src/turnstile.ts";
import { sha256Hex } from "../src/feedback.ts";
import { call, getJson, makeEnv, migrate, sortedKeys } from "./helpers.ts";

const e = makeEnv();

type FetchArgs = Parameters<typeof fetch>;
let siteverify: { calls: { url: string; form: FormData }[]; reply: () => Response | Promise<Response> };

beforeAll(migrate);
beforeEach(async () => {
  await env.DB_FEEDBACK.prepare("DELETE FROM feedback").run();
  siteverify = { calls: [], reply: () => Response.json({ success: true }) };
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (...args: FetchArgs) => {
    const req = new Request(...args);
    if (req.url === SITEVERIFY_URL) {
      siteverify.calls.push({ url: req.url, form: await req.formData() });
      return siteverify.reply();
    }
    return realFetch(...args);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const valid = {
  target: { shiurId: "yi-parsha-noach-01", momentId: "yi-parsha-noach-01~s0", field: "source" },
  reason: "wrong-source",
  text: "The source is Bereishis 6:9, not 6:8.",
  ui: "en",
  rev: "rev-1",
  turnstile: "token-abc",
};

function post(body: unknown, headers: Record<string, string> = {}, ip = "198.51.100.7"): Promise<Response> {
  return call(e, "/api/feedback", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "TestAgent/1.0", "cf-connecting-ip": ip, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/feedback", () => {
  it("stores a valid report with a salted UA hash and no IP, and answers 202 {id}", async () => {
    const res = await post(valid);
    expect(res.status).toBe(202);
    const body = (await res.json()) as { id: string };
    expect(sortedKeys(body)).toEqual([...ALLOWED_KEYS.feedbackAccepted]);
    const row = await env.DB_FEEDBACK.prepare("SELECT * FROM feedback WHERE id = ?").bind(body.id).first<Record<string, unknown>>();
    expect(row).toMatchObject({
      shiur_id: "yi-parsha-noach-01",
      moment_id: "yi-parsha-noach-01~s0",
      field: "source",
      reason: "wrong-source",
      text: valid.text,
      ui: "en",
      rev: "rev-1",
      status: "open",
      ua_hash: await sha256Hex("test-salt\u0000TestAgent/1.0"),
    });
    expect(JSON.stringify(row)).not.toContain("198.51.100.7");
    expect(JSON.stringify(row)).not.toContain("TestAgent");
    // Turnstile got the secret, the token and the client address
    expect(siteverify.calls).toHaveLength(1);
    expect(siteverify.calls[0]?.form.get("secret")).toBe("test-turnstile-secret");
    expect(siteverify.calls[0]?.form.get("response")).toBe("token-abc");
    expect(siteverify.calls[0]?.form.get("remoteip")).toBe("198.51.100.7");
  });

  it("stores which recording was playing, and NULL when the client does not say", async () => {
    for (const audio of ["cleaned", "original"] as const) {
      const res = await post({ ...valid, audio });
      expect(res.status).toBe(202);
      const { id } = (await res.json()) as { id: string };
      const row = await env.DB_FEEDBACK.prepare("SELECT audio FROM feedback WHERE id = ?").bind(id).first<{ audio: string | null }>();
      expect(row?.audio).toBe(audio);
    }
    const res = await post(valid);
    const { id } = (await res.json()) as { id: string };
    const row = await env.DB_FEEDBACK.prepare("SELECT audio FROM feedback WHERE id = ?").bind(id).first<{ audio: string | null }>();
    expect(row?.audio).toBeNull();
  });

  it("accepts a minimal report (no moment, field or text)", async () => {
    const res = await post({ target: { shiurId: "en-misc-01" }, reason: "other", ui: "yi", rev: "r", turnstile: "t" });
    expect(res.status).toBe(202);
  });

  it("answers 403 when Turnstile rejects the token and stores nothing", async () => {
    siteverify.reply = () => Response.json({ success: false, "error-codes": ["invalid-input-response"] });
    const { status, body } = await getJson(e, "/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(valid),
    });
    expect(status).toBe(403);
    expect(body).toEqual({ error: "turnstile_failed" });
    const n = await env.DB_FEEDBACK.prepare("SELECT count(*) AS n FROM feedback").first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it("answers 503 when Turnstile cannot be reached", async () => {
    siteverify.reply = () => new Response("bad gateway", { status: 502 });
    const res = await post(valid);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "turnstile_unavailable" });
  });

  it("enforces length caps and the field allow-lists before calling Turnstile", async () => {
    const bad: [unknown, string][] = [
      [{ ...valid, text: "x".repeat(1001) }, "text"],
      [{ ...valid, text: 5 }, "text"],
      [{ ...valid, text: "bell\u0007" }, "text"],
      [{ ...valid, reason: "spam" }, "reason"],
      [{ ...valid, ui: "fr" }, "ui"],
      [{ ...valid, rev: "" }, "rev"],
      [{ ...valid, rev: "r".repeat(65) }, "rev"],
      [{ ...valid, audio: "remastered" }, "audio"],
      [{ ...valid, audio: 1 }, "audio"],
      [{ ...valid, turnstile: "" }, "turnstile"],
      [{ ...valid, turnstile: "t".repeat(2049) }, "turnstile"],
      [{ ...valid, target: { ...valid.target, shiurId: "../etc" } }, "target.shiurId"],
      [{ ...valid, target: { ...valid.target, momentId: "other-shiur~s0" } }, "target.momentId"],
      [{ ...valid, target: { ...valid.target, field: "everything" } }, "target.field"],
      [{ ...valid, target: { ...valid.target, ip: "1.2.3.4" } }, "unknown_parameter"],
      [{ ...valid, email: "a@b.c" }, "unknown_parameter"],
      [[valid], "body"],
      ["{not json", "body"],
    ];
    for (const [body, param] of bad) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(await res.json()).toEqual({ error: "bad_request", param });
    }
    expect(siteverify.calls).toHaveLength(0);
    // exactly at the cap is fine (1000 code points, including astral characters)
    expect((await post({ ...valid, text: "א".repeat(999) + "𝔸" })).status).toBe(202);
  });

  it("rejects bodies over 8 KiB and non-JSON content types", async () => {
    const big = await post({ ...valid, text: "x".repeat(9000) });
    expect(big.status).toBe(413);
    const form = await post("a=b", { "content-type": "application/x-www-form-urlencoded" });
    expect(form.status).toBe(415);
  });

  it("only accepts POST", async () => {
    const res = await call(e, "/api/feedback");
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});

describe("rate limiting (real RATE binding, 30 requests / 10 s per client)", () => {
  it("answers 429 after 30 requests from one address, while others still pass", async () => {
    const limited = makeEnv({ rate: env.RATE });
    const ip = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      const res = await call(limited, "/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify(valid),
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 202)).toBe(true);
    expect(statuses[30]).toBe(429);
    const other = await call(limited, "/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.250" },
      body: JSON.stringify(valid),
    });
    expect(other.status).toBe(202);
  });

  it("search is rate limited too, with Retry-After", async () => {
    let n = 0;
    const limited = makeEnv({ rate: { limit: async () => ({ success: ++n <= 2 }) } });
    expect((await call(limited, "/api/search?q=a&mode=lexical")).status).toBe(200);
    expect((await call(limited, "/api/search?q=a&mode=lexical")).status).toBe(200);
    const third = await call(limited, "/api/search?q=a&mode=lexical");
    expect(third.status).toBe(429);
    expect(third.headers.get("retry-after")).toBe("10");
    expect(await third.json()).toEqual({ error: "rate_limited" });
    expect((await call(limited, "/api/similar?moment=a~s0")).status).toBe(429);
  });
});
