/**
 * emunas-api Worker (skeleton). Reached only through the Live site's service
 * binding (workers_dev: false, no route). W2.6 adds /api/search, /api/similar,
 * /api/feedback, /api/health and /admin/feedback (integration-plan §3.1).
 */

// Bindings (D1, Vectorize, AI, RATE, secrets) are declared by W2.6.
export type Env = Record<string, never>;

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

export function notFound(): Response {
  return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: JSON_HEADERS });
}

export default {
  async fetch(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
    return notFound();
  },
} satisfies ExportedHandler<Env>;
