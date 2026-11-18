/**
 * The client side of `POST /api/feedback` (tech-live §7, served by `workers/api`, W2.6).
 *
 * The request shape mirrors `workers/api/src/contract.ts` and `workers/api/src/feedback.ts`
 * (`api.test.ts` holds the two lists and limits equal, so a change on one side fails the build).
 * The response is reduced to an outcome the dialog can word; nothing from the server is shown.
 */
import type { AudioVersion, UiLang } from "@emunas/i18n";

export const FEEDBACK_ENDPOINT = "/api/feedback";

export const FEEDBACK_REASONS = ["wrong-source", "wrong-name", "wrong-time", "misrepresents", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_FIELDS = ["source", "person", "time", "summary", "other"] as const;
export type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

/** Same cap as the Worker (code points, after NFC and trim). */
export const MAX_TEXT_LENGTH = 1000;

/** What a report is about: the shiur, and optionally one item in it and the part of that item. */
export interface FeedbackTarget {
  shiurId: string;
  momentId?: string | null | undefined;
  field?: FeedbackField | null | undefined;
}

export interface FeedbackBody {
  target: { shiurId: string; momentId?: string; field?: FeedbackField };
  reason: FeedbackReason;
  text?: string;
  ui: UiLang;
  rev: string;
  /** Which recording was playing for this shiur when the report was sent; left out when none. */
  audio?: AudioVersion;
  turnstile: string;
}

/** The part of the item a reason points at. "other" keeps the item's own hint, if any. */
const FIELD_FOR_REASON: Record<FeedbackReason, FeedbackField | null> = {
  "wrong-source": "source",
  "wrong-name": "person",
  "wrong-time": "time",
  misrepresents: "summary",
  other: null,
};

export function fieldFor(reason: FeedbackReason, hint: FeedbackField | null | undefined): FeedbackField | null {
  return FIELD_FOR_REASON[reason] ?? hint ?? null;
}

/** Count code points the way the Worker does. */
export function noteLength(text: string): number {
  return [...text.normalize("NFC").trim()].length;
}

/** Builds the exact request body; empty optional parts are left out. */
export function buildBody(input: {
  target: FeedbackTarget;
  reason: FeedbackReason;
  text: string;
  ui: UiLang;
  rev: string;
  turnstile: string;
  audio?: AudioVersion | null;
}): FeedbackBody {
  const target: FeedbackBody["target"] = { shiurId: input.target.shiurId };
  if (input.target.momentId) target.momentId = input.target.momentId;
  const field = fieldFor(input.reason, input.target.field);
  if (field) target.field = field;
  const body: FeedbackBody = { target, reason: input.reason, ui: input.ui, rev: input.rev, turnstile: input.turnstile };
  const text = input.text.normalize("NFC").trim();
  if (text.length > 0) body.text = text;
  if (input.audio) body.audio = input.audio;
  return body;
}

export type SubmitOutcome =
  | { kind: "sent"; id: string }
  /** Turnstile said no (403): get a fresh token and let the person choose again. */
  | { kind: "verify" }
  /** Rate limited (429). */
  | { kind: "rate" }
  /** The service or its Turnstile check is down (503), or another server error. */
  | { kind: "unavailable" }
  /** The request was refused as malformed (400/413/415): in practice only a note that is too long. */
  | { kind: "invalid" }
  /** No response at all. */
  | { kind: "network" };

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    // not JSON
  }
  return null;
}

/** Maps a response from the Worker to an outcome. */
export async function outcomeOf(res: Response): Promise<SubmitOutcome> {
  if (res.status === 202 || res.status === 200) {
    try {
      const body: unknown = await res.json();
      const id = typeof body === "object" && body !== null ? (body as { id?: unknown }).id : undefined;
      if (typeof id === "string" && id.length > 0) return { kind: "sent", id };
    } catch {
      // fall through
    }
    return { kind: "unavailable" };
  }
  const code = await errorCode(res);
  if (res.status === 403 && (code === "turnstile_failed" || code === null)) return { kind: "verify" };
  if (res.status === 429) return { kind: "rate" };
  if (res.status === 400 || res.status === 413 || res.status === 415) return { kind: "invalid" };
  return { kind: "unavailable" };
}

export async function submitFeedback(body: FeedbackBody, fetchImpl: typeof fetch): Promise<SubmitOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "network" };
  }
  return outcomeOf(res);
}
