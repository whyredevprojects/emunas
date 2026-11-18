/**
 * The request the dialog sends is exactly what `emunas-api` accepts: the reason/field lists and the
 * note cap equal the Worker's, and every body `buildBody` makes passes the Worker's own parser.
 * Responses map to the outcomes the dialog words.
 */
import { describe, expect, it } from "vitest";
import * as worker from "../../../../../workers/api/src/contract.ts";
import {
  FEEDBACK_FIELDS,
  FEEDBACK_REASONS,
  MAX_TEXT_LENGTH,
  buildBody,
  fieldFor,
  noteLength,
  outcomeOf,
  submitFeedback,
  type FeedbackBody,
} from "./api.ts";
import { TEST_SITE_KEY_PASS, resolveSiteKey, turnstileLanguage } from "./turnstile.ts";

/**
 * The Worker's parser, loaded at run time: its module graph carries Cloudflare-only types
 * (`D1Database`, Vectorize) that the app's `tsc` project does not include.
 */
interface WorkerFeedback {
  MAX_TEXT_LENGTH: number;
  parseFeedback(raw: unknown): { ok: true; value: { shiurId: string; momentId: string | null; reason: string; text: string | null; audio: string | null } } | { ok: false; param: string };
}
const workerFeedbackPath = new URL("../../../../../workers/api/src/feedback.ts", import.meta.url).href;
const { MAX_TEXT_LENGTH: WORKER_MAX_TEXT, parseFeedback } = (await import(/* @vite-ignore */ workerFeedbackPath)) as WorkerFeedback;

const base = { ui: "en" as const, rev: "r-2026-11-15.1", turnstile: "XXXX.DUMMY.TOKEN.XXXX" };

describe("contract parity with workers/api", () => {
  it("uses the Worker's reason and field lists and note cap", () => {
    expect([...FEEDBACK_REASONS]).toEqual([...worker.FEEDBACK_REASONS]);
    expect([...FEEDBACK_FIELDS]).toEqual([...worker.FEEDBACK_FIELDS]);
    expect(MAX_TEXT_LENGTH).toBe(WORKER_MAX_TEXT);
  });

  it("builds bodies the Worker's parser accepts, for every reason, with and without an item", () => {
    for (const reason of FEEDBACK_REASONS) {
      for (const target of [
        { shiurId: "yi-zmanim-tv-bb-04" },
        { shiurId: "yi-zmanim-tv-bb-04", momentId: "yi-zmanim-tv-bb-04~src14", field: "source" as const },
        { shiurId: "yi-zmanim-tv-bb-04", momentId: "yi-zmanim-tv-bb-04~wen0.0", field: null },
        { shiurId: "yi-zmanim-tv-bb-04", momentId: null },
      ]) {
        for (const text of ["", "  the page says Rashi, he quotes the Ramban  ", "א מעלדונג אויף אידיש"]) {
          const body = buildBody({ ...base, target, reason, text });
          const parsed = parseFeedback(JSON.parse(JSON.stringify(body)));
          expect(parsed.ok, JSON.stringify(body)).toBe(true);
          if (!parsed.ok) continue;
          expect(parsed.value.shiurId).toBe(target.shiurId);
          expect(parsed.value.momentId).toBe(target.momentId ?? null);
          expect(parsed.value.reason).toBe(reason);
          expect(parsed.value.text).toBe(text.trim() === "" ? null : text.trim());
        }
      }
    }
  });

  it("sends the version that was playing, which the Worker stores, and leaves it out when none", () => {
    for (const audio of ["cleaned", "original"] as const) {
      const body = buildBody({ ...base, target: { shiurId: "a-1" }, reason: "other", text: "", audio });
      expect(body.audio).toBe(audio);
      const parsed = parseFeedback(JSON.parse(JSON.stringify(body)));
      expect(parsed.ok && parsed.value.audio).toBe(audio);
    }
    const none = buildBody({ ...base, target: { shiurId: "a-1" }, reason: "other", text: "", audio: null });
    expect("audio" in none).toBe(false);
    const parsed = parseFeedback(none);
    expect(parsed.ok && parsed.value.audio).toBeNull();
  });

  it("accepts a note of exactly the cap and the Worker refuses one over it", () => {
    const at = buildBody({ ...base, target: { shiurId: "a-1" }, reason: "other", text: "א".repeat(MAX_TEXT_LENGTH) });
    expect(parseFeedback(at).ok).toBe(true);
    const over = buildBody({ ...base, target: { shiurId: "a-1" }, reason: "other", text: "א".repeat(MAX_TEXT_LENGTH + 1) });
    expect(parseFeedback(over).ok).toBe(false);
    expect(noteLength("א".repeat(MAX_TEXT_LENGTH + 1))).toBe(MAX_TEXT_LENGTH + 1);
  });
});

describe("buildBody", () => {
  it("derives the field from the reason, keeping the item's hint for 'other'", () => {
    expect(fieldFor("wrong-source", "summary")).toBe("source");
    expect(fieldFor("wrong-name", null)).toBe("person");
    expect(fieldFor("wrong-time", "source")).toBe("time");
    expect(fieldFor("misrepresents", "source")).toBe("summary");
    expect(fieldFor("other", "source")).toBe("source");
    expect(fieldFor("other", null)).toBeNull();
  });

  it("leaves out empty optional parts and sends only allowed keys", () => {
    const body: FeedbackBody = buildBody({ ...base, target: { shiurId: "s-1", momentId: null, field: null }, reason: "other", text: "   " });
    expect(body).toEqual({ target: { shiurId: "s-1" }, reason: "other", ui: "en", rev: base.rev, turnstile: base.turnstile });
  });
});

describe("outcomes", () => {
  const res = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("maps Worker responses", async () => {
    expect(await outcomeOf(res(202, { id: "abc" }))).toEqual({ kind: "sent", id: "abc" });
    expect(await outcomeOf(res(202, {}))).toEqual({ kind: "unavailable" });
    expect(await outcomeOf(res(403, { error: "turnstile_failed" }))).toEqual({ kind: "verify" });
    expect(await outcomeOf(res(403, { error: "forbidden" }))).toEqual({ kind: "unavailable" });
    expect(await outcomeOf(res(429, { error: "rate_limited" }))).toEqual({ kind: "rate" });
    expect(await outcomeOf(res(503, { error: "turnstile_unavailable" }))).toEqual({ kind: "unavailable" });
    expect(await outcomeOf(res(400, { error: "bad_request", param: "text" }))).toEqual({ kind: "invalid" });
    expect(await outcomeOf(new Response("oops", { status: 500 }))).toEqual({ kind: "unavailable" });
  });

  it("posts JSON to /api/feedback and reports a network failure", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const ok: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return res(202, { id: "x1" });
    };
    const body = buildBody({ ...base, target: { shiurId: "s-1" }, reason: "wrong-time", text: "" });
    expect(await submitFeedback(body, ok)).toEqual({ kind: "sent", id: "x1" });
    expect(calls[0]!.url).toBe("/api/feedback");
    expect(calls[0]!.init?.method).toBe("POST");
    expect(new Headers(calls[0]!.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual(body);

    const down: typeof fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await submitFeedback(body, down)).toEqual({ kind: "network" });
  });
});

describe("Turnstile configuration", () => {
  it("uses the configured key, the test key locally, and none elsewhere", () => {
    expect(resolveSiteKey({ VITE_TURNSTILE_SITE_KEY: "0x4AAA" }, "listen.example.org")).toBe("0x4AAA");
    expect(resolveSiteKey({ DEV: true }, "listen.example.org")).toBe(TEST_SITE_KEY_PASS);
    expect(resolveSiteKey({}, "127.0.0.1")).toBe(TEST_SITE_KEY_PASS);
    expect(resolveSiteKey({}, "localhost")).toBe(TEST_SITE_KEY_PASS);
    expect(resolveSiteKey({ VITE_TURNSTILE_SITE_KEY: "  " }, "listen.example.org")).toBeNull();
    expect(resolveSiteKey({}, null)).toBeNull();
  });

  it("asks Turnstile for English or the browser's language", () => {
    expect(turnstileLanguage("en")).toBe("en");
    expect(turnstileLanguage("yi")).toBe("auto");
  });
});
