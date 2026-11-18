/**
 * POST /api/feedback: "something's wrong here" reports into D1 emunas-feedback.
 * No IP address is stored (it is only passed to Turnstile and used as the rate-limit key);
 * the user agent is stored as a salted SHA-256 hash.
 */
import { error, json, UNKNOWN_PARAMETER } from "./http.ts";
import type { Env } from "./env.ts";
import { verifyTurnstile } from "./turnstile.ts";
import { isMomentId } from "./params.ts";
import {
  FEEDBACK_AUDIO,
  FEEDBACK_FIELDS,
  FEEDBACK_REASONS,
  isLang,
  type FeedbackAccepted,
  type FeedbackAudio,
  type FeedbackField,
  type FeedbackReason,
  type Lang,
} from "./contract.ts";

export const MAX_BODY_BYTES = 8 * 1024;
export const MAX_TEXT_LENGTH = 1000;
export const MAX_REV_LENGTH = 64;
export const MAX_TURNSTILE_LENGTH = 2048;
const SHIUR_RE = /^[a-z0-9][a-z0-9-]{0,119}$/;

export interface FeedbackInput {
  shiurId: string;
  momentId: string | null;
  field: FeedbackField | null;
  reason: FeedbackReason;
  text: string | null;
  ui: Lang;
  rev: string;
  audio: FeedbackAudio | null;
  turnstile: string;
}

type Parsed = { ok: true; value: FeedbackInput } | { ok: false; param: string };

/** Control characters other than tab, line feed and carriage return. */
function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || c === 0x7f) return true;
  }
  return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validates the body field by field; unknown keys are rejected. */
export function parseFeedback(raw: unknown): Parsed {
  if (!isRecord(raw)) return { ok: false, param: "body" };
  const allowed = new Set(["target", "reason", "text", "ui", "rev", "audio", "turnstile"]);
  for (const k of Object.keys(raw)) if (!allowed.has(k)) return { ok: false, param: UNKNOWN_PARAMETER };

  const target = raw["target"];
  if (!isRecord(target)) return { ok: false, param: "target" };
  for (const k of Object.keys(target)) if (!["shiurId", "momentId", "field"].includes(k)) return { ok: false, param: UNKNOWN_PARAMETER };
  const shiurId = target["shiurId"];
  if (typeof shiurId !== "string" || !SHIUR_RE.test(shiurId)) return { ok: false, param: "target.shiurId" };
  const momentId = target["momentId"] ?? null;
  if (momentId !== null && (typeof momentId !== "string" || !isMomentId(momentId) || !momentId.startsWith(`${shiurId}~`))) {
    return { ok: false, param: "target.momentId" };
  }
  const field = target["field"] ?? null;
  if (field !== null && (typeof field !== "string" || !(FEEDBACK_FIELDS as readonly string[]).includes(field))) {
    return { ok: false, param: "target.field" };
  }

  const reason = raw["reason"];
  if (typeof reason !== "string" || !(FEEDBACK_REASONS as readonly string[]).includes(reason)) return { ok: false, param: "reason" };

  let text = raw["text"] ?? null;
  if (text !== null) {
    if (typeof text !== "string") return { ok: false, param: "text" };
    text = text.normalize("NFC").trim();
    if ([...(text as string)].length > MAX_TEXT_LENGTH || hasControlChars(text as string)) {
      return { ok: false, param: "text" };
    }
    if ((text as string).length === 0) text = null;
  }

  const ui = raw["ui"];
  if (typeof ui !== "string" || !isLang(ui)) return { ok: false, param: "ui" };
  const rev = raw["rev"];
  if (typeof rev !== "string" || rev.length === 0 || rev.length > MAX_REV_LENGTH || !/^[\x21-\x7E]+$/.test(rev)) {
    return { ok: false, param: "rev" };
  }
  const audio = raw["audio"] ?? null;
  if (audio !== null && (typeof audio !== "string" || !(FEEDBACK_AUDIO as readonly string[]).includes(audio))) {
    return { ok: false, param: "audio" };
  }
  const turnstile = raw["turnstile"];
  if (typeof turnstile !== "string" || turnstile.length === 0 || turnstile.length > MAX_TURNSTILE_LENGTH) {
    return { ok: false, param: "turnstile" };
  }

  return {
    ok: true,
    value: {
      shiurId,
      momentId: momentId as string | null,
      field: field as FeedbackField | null,
      reason: reason as FeedbackReason,
      text: text as string | null,
      ui,
      rev,
      audio: audio as FeedbackAudio | null,
      turnstile,
    },
  };
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  const buf = await request.arrayBuffer();
  if (buf.byteLength > MAX_BODY_BYTES) return null;
  return new TextDecoder().decode(buf);
}

export async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return error("unsupported_media_type");
  const text = await readBody(request);
  if (text === null) return error("payload_too_large");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return error("bad_request", "body");
  }
  const parsed = parseFeedback(raw);
  if (!parsed.ok) return error("bad_request", parsed.param);
  const input = parsed.value;

  const verdict = await verifyTurnstile(input.turnstile, env.TURNSTILE_SECRET, request.headers.get("cf-connecting-ip"));
  if (verdict === "failed") return error("turnstile_failed");
  if (verdict === "unavailable") return error("turnstile_unavailable");

  const id = crypto.randomUUID();
  const uaHash = await sha256Hex(`${env.FEEDBACK_HASH_SALT}\u0000${request.headers.get("user-agent") ?? ""}`);
  await env.DB_FEEDBACK.prepare(
    "INSERT INTO feedback (id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, audio, ua_hash, status) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')",
  )
    .bind(id, new Date().toISOString(), input.shiurId, input.momentId, input.field, input.reason, input.text, input.ui, input.rev, input.audio, uaHash)
    .run();
  return json({ id } satisfies FeedbackAccepted, 202);
}
