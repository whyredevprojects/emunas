/**
 * Cloudflare Access check for /admin/*. Access sits in front of analyze.<domain>/admin/* and
 * adds a signed `Cf-Access-Jwt-Assertion` header; the Live site Worker forwards the request
 * through the service binding unchanged. This Worker verifies that JWT itself (RS256 against
 * the team's published certs, audience, issuer, expiry), so a request that did not pass
 * Access is refused even if it reaches the binding some other way. Fails closed when the
 * Access settings are missing.
 */

export type AccessResult = { ok: true; email: string | null } | { ok: false; status: 401 | 403 };

interface Jwk extends JsonWebKey {
  kid?: string;
}

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache: { team: string; at: number; keys: Jwk[] } | null = null;

/** Test hook: forget cached certificates. */
export function resetAccessCache(): void {
  certsCache = null;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function normalizeTeamDomain(team: string): string {
  const t = team.trim().replace(/\/+$/, "");
  return t.startsWith("https://") ? t : `https://${t}`;
}

async function certs(team: string, forceRefresh: boolean): Promise<Jwk[]> {
  const now = Date.now();
  if (!forceRefresh && certsCache && certsCache.team === team && now - certsCache.at < CERTS_TTL_MS) return certsCache.keys;
  const res = await fetch(`${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error("access certs unavailable");
  const body = (await res.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
  certsCache = { team, at: now, keys };
  return keys;
}

export async function verifyAccess(request: Request, teamDomain: string | undefined, aud: string | undefined): Promise<AccessResult> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (token === null || token.length === 0) return { ok: false, status: 401 };
  if (!teamDomain || !aud) return { ok: false, status: 403 };
  const team = normalizeTeamDomain(teamDomain);

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, status: 403 };
  const [h, p, s] = parts as [string, string, string];
  const header = decodeJson(h);
  const payload = decodeJson(p);
  if (!header || !payload || header["alg"] !== "RS256" || typeof header["kid"] !== "string") return { ok: false, status: 403 };

  let keys: Jwk[];
  try {
    keys = await certs(team, false);
    if (!keys.some((k) => k.kid === header["kid"])) keys = await certs(team, true);
  } catch {
    return { ok: false, status: 403 };
  }
  const jwk = keys.find((k) => k.kid === header["kid"]);
  if (!jwk) return { ok: false, status: 403 };

  let valid: boolean;
  try {
    const { kid: _kid, ...keyData } = jwk;
    const key = await crypto.subtle.importKey("jwk", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 403 };

  const now = Math.floor(Date.now() / 1000);
  const audClaim = payload["aud"];
  const auds = Array.isArray(audClaim) ? audClaim : [audClaim];
  if (!auds.includes(aud)) return { ok: false, status: 403 };
  if (payload["iss"] !== team) return { ok: false, status: 403 };
  if (typeof payload["exp"] !== "number" || payload["exp"] <= now) return { ok: false, status: 403 };
  if (typeof payload["nbf"] === "number" && payload["nbf"] > now + 60) return { ok: false, status: 403 };

  return { ok: true, email: typeof payload["email"] === "string" ? payload["email"] : null };
}
