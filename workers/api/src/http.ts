/** Small response helpers. Every body this Worker sends is built from explicit fields. */

export const NO_STORE = "no-store";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": NO_STORE,
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

export type ErrorCode =
  | "not_found"
  | "method_not_allowed"
  | "bad_request"
  | "stale_cursor"
  | "rate_limited"
  | "turnstile_failed"
  | "turnstile_unavailable"
  | "payload_too_large"
  | "unsupported_media_type"
  | "unauthorized"
  | "forbidden"
  | "unavailable";

const STATUS: Record<ErrorCode, number> = {
  not_found: 404,
  method_not_allowed: 405,
  bad_request: 400,
  stale_cursor: 409,
  rate_limited: 429,
  turnstile_failed: 403,
  turnstile_unavailable: 503,
  payload_too_large: 413,
  unsupported_media_type: 415,
  unauthorized: 401,
  forbidden: 403,
  unavailable: 503,
};

/** Error bodies carry a fixed code and, for 400s, the name of the offending parameter. */
export function error(code: ErrorCode, param?: string, headers: Record<string, string> = {}): Response {
  const body: { error: ErrorCode; param?: string } = { error: code };
  if (param !== undefined) body.param = param;
  return json(body, STATUS[code], headers);
}

/** Reported for any parameter or body key outside the allow-list (the name itself is not echoed). */
export const UNKNOWN_PARAMETER = "unknown_parameter";

export class BadRequest extends Error {
  constructor(readonly param: string) {
    super(`bad parameter: ${param}`);
  }
}

/** Client address for rate limiting only. It is never stored or logged. */
export function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "anonymous";
}
