/** Server-side Turnstile verification (siteverify). */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileResult = "ok" | "failed" | "unavailable";

export async function verifyTurnstile(token: string, secret: string, remoteIp: string | null): Promise<TurnstileResult> {
  if (secret.length === 0) return "unavailable";
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (remoteIp !== null) form.append("remoteip", remoteIp);
  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, { method: "POST", body: form });
  } catch {
    return "unavailable";
  }
  if (!res.ok) return "unavailable";
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return "unavailable";
  }
  return typeof body === "object" && body !== null && (body as { success?: unknown }).success === true ? "ok" : "failed";
}
