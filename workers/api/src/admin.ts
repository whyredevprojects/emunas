/** GET /admin/feedback?status=open|done|rejected|all&format=json|csv&limit=… (behind Access). */
import { error, json, UNKNOWN_PARAMETER } from "./http.ts";
import type { Env } from "./env.ts";
import { verifyAccess } from "./access.ts";
import { FEEDBACK_STATUSES, type FeedbackAudio, type FeedbackField, type FeedbackReason, type FeedbackRow, type FeedbackStatus, type Lang } from "./contract.ts";

export const DEFAULT_ADMIN_LIMIT = 500;
export const MAX_ADMIN_LIMIT = 5000;

interface DbRow {
  id: string;
  created_at: string;
  shiur_id: string;
  moment_id: string | null;
  field: string | null;
  reason: string;
  text: string | null;
  ui: string;
  rev: string;
  audio: string | null;
  status: string;
}

const CSV_COLUMNS = ["id", "createdAt", "shiurId", "momentId", "field", "reason", "text", "ui", "rev", "audio", "status"] as const satisfies readonly (keyof FeedbackRow)[];

/** RFC 4180 quoting, plus a leading apostrophe on cells a spreadsheet would run as a formula. */
export function csvCell(v: string | null): string {
  if (v === null) return "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: readonly FeedbackRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export async function handleAdminFeedback(request: Request, env: Env): Promise<Response> {
  const access = await verifyAccess(request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
  if (!access.ok) return error(access.status === 401 ? "unauthorized" : "forbidden");

  const sp = new URL(request.url).searchParams;
  for (const k of sp.keys()) if (!["status", "format", "limit"].includes(k)) return error("bad_request", UNKNOWN_PARAMETER);
  const status = sp.get("status") ?? "open";
  if (status !== "all" && !(FEEDBACK_STATUSES as readonly string[]).includes(status)) return error("bad_request", "status");
  const format = sp.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return error("bad_request", "format");
  const rawLimit = sp.get("limit");
  const limit = rawLimit === null ? DEFAULT_ADMIN_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ADMIN_LIMIT) return error("bad_request", "limit");

  const where = status === "all" ? "" : "WHERE status = ?";
  const stmt = env.DB_FEEDBACK.prepare(
    `SELECT id, created_at, shiur_id, moment_id, field, reason, text, ui, rev, audio, status FROM feedback ${where} ORDER BY created_at DESC, id LIMIT ?`,
  );
  const { results } = await (status === "all" ? stmt.bind(limit) : stmt.bind(status, limit)).all<DbRow>();
  const rows: FeedbackRow[] = results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    shiurId: r.shiur_id,
    momentId: r.moment_id,
    field: r.field as FeedbackField | null,
    reason: r.reason as FeedbackReason,
    text: r.text,
    ui: r.ui as Lang,
    rev: r.rev,
    audio: r.audio as FeedbackAudio | null,
    status: r.status as FeedbackStatus,
  }));

  if (format === "csv") {
    return new Response(toCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="emunas-feedback.csv"',
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return json({ items: rows });
}
