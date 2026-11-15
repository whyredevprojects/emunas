/** GET /api/health → { rev, d1, vectorize }. 503 when D1 is down (search cannot work). */
import { json } from "./http.ts";
import type { Env } from "./env.ts";
import { corpusRev } from "./search.ts";
import type { Health, HealthResponse } from "./contract.ts";

export async function handleHealth(env: Env): Promise<Response> {
  let rev = "unknown";
  let d1: Health = "ok";
  let vectorize: Health = "ok";
  await Promise.all([
    corpusRev(env.DB_SEARCH).then(
      (r) => {
        rev = r;
      },
      () => {
        d1 = "error";
      },
    ),
    env.VEC.describe().then(
      () => undefined,
      () => {
        vectorize = "error";
      },
    ),
  ]);
  const body: HealthResponse = { rev, d1, vectorize };
  return json(body, d1 === "ok" ? 200 : 503);
}
