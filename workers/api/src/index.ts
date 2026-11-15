/**
 * emunas-api Worker. Reached only through the Live site's service binding (workers_dev: false,
 * no route). Routes (integration-plan §3.1, tech-live §5.4, §7):
 *
 *   GET  /api/search      hybrid moment search (D1 FTS5 + Vectorize, RRF, grouped by shiur)
 *   GET  /api/similar     Vectorize neighbours of one moment
 *   GET  /api/health      { rev, d1, vectorize }
 *   POST /api/feedback    user report (Turnstile, length caps, rate limit)
 *   GET  /admin/feedback  report export, JSON or CSV (Cloudflare Access JWT required)
 *
 * Public text comes only from generated/catalog fields in D1 (§0.1–0.2).
 */
import type { Env } from "./env.ts";
import { clientKey, error } from "./http.ts";
import { handleSearch } from "./search.ts";
import { handleSimilar } from "./similar.ts";
import { handleHealth } from "./health.ts";
import { handleFeedback } from "./feedback.ts";
import { handleAdminFeedback } from "./admin.ts";

export type { Env } from "./env.ts";

type Handler = (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;

interface Route {
  method: "GET" | "POST";
  rateLimited: boolean;
  handler: Handler;
}

const ROUTES: Record<string, Route> = {
  "/api/search": { method: "GET", rateLimited: true, handler: handleSearch },
  "/api/similar": { method: "GET", rateLimited: true, handler: (r, e) => handleSimilar(r, e) },
  "/api/health": { method: "GET", rateLimited: false, handler: (_r, e) => handleHealth(e) },
  "/api/feedback": { method: "POST", rateLimited: true, handler: (r, e) => handleFeedback(r, e) },
  "/admin/feedback": { method: "GET", rateLimited: false, handler: (r, e) => handleAdminFeedback(r, e) },
};

export function notFound(): Response {
  return error("not_found");
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  const r = Object.hasOwn(ROUTES, pathname) ? ROUTES[pathname] : undefined;
  if (!r) return notFound();
  const method = request.method === "HEAD" && r.method === "GET" ? "GET" : request.method;
  if (method !== r.method) return error("method_not_allowed", undefined, { allow: r.method });

  if (r.rateLimited) {
    const bucket = pathname === "/api/feedback" ? "feedback" : "read";
    const { success } = await env.RATE.limit({ key: `${bucket}:${clientKey(request)}` });
    if (!success) return error("rate_limited", undefined, { "retry-after": "10" });
  }
  return r.handler(request, env, ctx);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch {
      // Never echo internals (SQL, bindings, stored text) to the client.
      return error("unavailable");
    }
  },
} satisfies ExportedHandler<Env>;
