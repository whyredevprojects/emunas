/**
 * Public audio URLs (integration-plan Amendment A1).
 *
 * Audio is served straight from the existing `emunas` R2 bucket on its public custom domain
 * (`media.<domain>`). The URL of a recording is
 *
 *   `${MEDIA_ORIGIN}/${encodeURIComponent(segment) for each "/"-separated segment of audioKey}`
 *
 * `MEDIA_ORIGIN` is build config (env `EMUNAS_MEDIA_ORIGIN`). The key itself never appears in public
 * output as a field; only the encoded URL does.
 *
 * Pure and browser/Workers-safe: no Node APIs.
 */

/** Dev/test placeholder; a real build sets `EMUNAS_MEDIA_ORIGIN`. `.invalid` never resolves (RFC 2606). */
export const DEFAULT_MEDIA_ORIGIN = "https://media.example.invalid";

/** Env var the corpus build reads the media origin from. */
export const MEDIA_ORIGIN_ENV = "EMUNAS_MEDIA_ORIGIN";

/** A public media URL (`http` only for local dev origins). */
export type MediaUrl = `https://${string}` | `http://${string}`;

/** A media URL with a media-fragment start time (works without JS). */
export type MediaTimeUrl = `${MediaUrl}#t=${number}`;

/**
 * Validates and canonicalises a media origin: `scheme://host[:port]`, no path, query, hash or
 * credentials; a trailing slash is dropped. `https` is required except for loopback hosts
 * (`localhost`, `127.0.0.1`, `[::1]`), which may use `http` for local testing.
 * Throws on anything else (a configuration error, never data).
 */
export function normalizeMediaOrigin(origin: string): string {
  let u: URL;
  try {
    u = new URL(origin.trim());
  } catch {
    throw new Error(`Invalid media origin ${JSON.stringify(origin)}: not a URL`);
  }
  const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && loopback)) {
    throw new Error(`Invalid media origin ${JSON.stringify(origin)}: must be https (http only for localhost)`);
  }
  if (u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) {
    throw new Error(`Invalid media origin ${JSON.stringify(origin)}: must be scheme://host[:port] only`);
  }
  if (origin.trim().replace(/\/$/, "").includes("?") || origin.includes("#")) {
    throw new Error(`Invalid media origin ${JSON.stringify(origin)}: must be scheme://host[:port] only`);
  }
  return u.origin;
}

/**
 * Substrings that point at transcript material (integration-plan §0.1, §5.3). A key containing one
 * is never turned into a URL: the guard would (rightly) fail on it, and no audio key has them.
 * (The guard's other forbidden substrings cannot end in `.mp3`, so the playability rule already
 * keeps them out of the audio table; they are not spelled here because only the transcript gate
 * and the guard may name them.)
 */
const FORBIDDEN_KEY_SUBSTRINGS = ["transcripts/", ".vtt"] as const;

export type KeyRefusal = "empty" | "suspicious-key" | "forbidden-substring";

function hasBadChars(key: string): boolean {
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    // C0 controls, DEL, backslash
    if (c < 0x20 || c === 0x7f || c === 0x5c) return true;
  }
  return false;
}

/**
 * Why a bucket key must never become a public URL, or null when it may. This is about safety, not
 * playability (see `unplayableReason`):
 * - not empty, no leading `/`, no empty / `.` / `..` segments, no backslash or control characters;
 * - no `transcripts/` or `.vtt` anywhere (case-insensitive).
 */
export function refuseKey(key: string): KeyRefusal | null {
  if (key.length === 0) return "empty";
  const lower = key.toLowerCase();
  if (FORBIDDEN_KEY_SUBSTRINGS.some((s) => lower.includes(s))) return "forbidden-substring";
  if (hasBadChars(key)) return "suspicious-key";
  if (key.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return "suspicious-key";
  return null;
}

/**
 * Percent-encodes each `/`-separated segment with `encodeURIComponent` (spaces → `%20`, `#` → `%23`,
 * `?` → `%3F`, non-ASCII → UTF-8 octets) and keeps the `/` separators. The key is used byte for
 * byte (no Unicode normalisation): R2 decodes the path back to exactly this key.
 */
export function encodeKeyPath(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/**
 * Public URL of a bucket object: `${origin}/${encodeKeyPath(key)}`.
 * Throws when the origin is invalid or the key is refused (`refuseKey`); both are build bugs or
 * config errors, never user input.
 */
export function mediaUrl(audioKey: string, origin: string): MediaUrl {
  const refusal = refuseKey(audioKey);
  if (refusal) throw new Error(`Refusing to build a media URL for this key (${refusal})`);
  return `${normalizeMediaOrigin(origin)}/${encodeKeyPath(audioKey)}` as MediaUrl;
}

/** `${url}#t=<sec>` media-fragment link. Seconds are floored, ≥ 0. */
export function mediaTimeUrl(url: MediaUrl, seconds: number): MediaTimeUrl {
  const t = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${url}#t=${t}`;
}
