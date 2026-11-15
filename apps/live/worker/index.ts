/**
 * emunas-live site Worker (integration-plan §1.2, §3.1, C20, Amendment A1).
 *
 * Static assets (build/client) are served by the platform without running this code.
 * `run_worker_first` in wrangler.jsonc sends only these paths here:
 *   "/"          → 302 to /yi/ or /en/ (cookie `emunas_ui`, then Accept-Language)
 *   "/api/*"     → service binding API (emunas-api)
 *   "/admin/*"   → service binding API (Access protects the hostname path)
 * There is no audio route: audio is served from the media host (Amendment A1).
 *
 * Responses produced here do not get `_headers` rules, so the Worker adds
 * `X-Robots-Tag: noindex` itself on workers.dev hosts (§2.1).
 */

/** The parts of a Fetcher (assets / service binding) this Worker uses. */
export interface FetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  ASSETS: FetcherLike;
  API: FetcherLike;
}

export type Ui = "yi" | "en";

/** Cookie the Live app writes when the reader picks an interface language (apps/live ui-preference). */
export const UI_COOKIE = "emunas_ui";
/** Used when neither the cookie nor Accept-Language names Yiddish, Hebrew or English. */
export const DEFAULT_UI: Ui = "en";

const UI_COOKIE_RE = new RegExp(`(?:^|;)\\s*${UI_COOKIE}=(yi|en)\\s*(?:;|$)`);

export function uiFromCookie(cookie: string | null): Ui | null {
  if (!cookie) return null;
  const m = UI_COOKIE_RE.exec(cookie);
  return m ? (m[1] as Ui) : null;
}

/** Primary language subtag → interface. Hebrew readers get the Hebrew-script (Yiddish) interface. */
const LANG_TO_UI: Readonly<Record<string, Ui>> = { yi: "yi", ji: "yi", he: "yi", iw: "yi", en: "en" };

/**
 * Picks the interface from an Accept-Language header: highest q first (ties keep header
 * order), q=0 entries ignored, first entry whose primary subtag maps to an interface wins.
 */
export function uiFromAcceptLanguage(header: string | null): Ui | null {
  if (!header) return null;
  const entries: { lang: string; q: number; pos: number }[] = [];
  header.split(",").forEach((part, pos) => {
    const [tagRaw = "", ...params] = part.trim().split(";");
    const lang = tagRaw.trim().toLowerCase().split("-")[0] ?? "";
    if (!/^[a-z]{1,8}$/.test(lang)) return;
    let q = 1;
    for (const p of params) {
      const [k, v] = p.split("=").map((s) => s.trim());
      if (k?.toLowerCase() === "q" && v !== undefined) {
        const n = Number(v);
        q = Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0;
      }
    }
    if (q > 0) entries.push({ lang, q, pos });
  });
  entries.sort((a, b) => b.q - a.q || a.pos - b.pos);
  for (const e of entries) {
    const ui = LANG_TO_UI[e.lang];
    if (ui) return ui;
  }
  return null;
}

export function chooseUi(request: Request): Ui {
  return (
    uiFromCookie(request.headers.get("cookie")) ??
    uiFromAcceptLanguage(request.headers.get("accept-language")) ??
    DEFAULT_UI
  );
}

export function isWorkersDevHost(hostname: string): boolean {
  return hostname === "workers.dev" || hostname.endsWith(".workers.dev");
}

function withNoindex(response: Response): Response {
  const out = new Response(response.body, response);
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}

function rootRedirect(request: Request, url: URL): Response {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const ui = chooseUi(request);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/${ui}/${url.search}`,
      "Cache-Control": "private, no-store",
      Vary: "Cookie, Accept-Language",
    },
  });
}

function isApiPath(pathname: string): boolean {
  return (
    pathname === "/api" || pathname.startsWith("/api/") || pathname === "/admin" || pathname.startsWith("/admin/")
  );
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let response: Response;
  if (url.pathname === "/") {
    response = rootRedirect(request, url);
  } else if (isApiPath(url.pathname)) {
    response = await env.API.fetch(request);
  } else {
    // Not routed here by run_worker_first; kept so the Worker is correct if the list changes.
    return env.ASSETS.fetch(request);
  }
  return isWorkersDevHost(url.hostname) ? withNoindex(response) : response;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
};
