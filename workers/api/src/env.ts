/**
 * Bindings of the emunas-api Worker (wrangler.jsonc). Vectorize and Workers AI are typed
 * structurally (only the calls this Worker makes) so tests can pass in-memory fakes;
 * the real bindings satisfy these shapes.
 */

export interface VectorIndex {
  query(vector: number[], options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
  queryById(vectorId: string, options?: VectorizeQueryOptions): Promise<VectorizeMatches>;
  describe(): Promise<unknown>;
}

export interface EmbeddingModel {
  run(model: string, inputs: { text: string[] }): Promise<unknown>;
}

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  /** D1 `emunas-search` (rebuildable index). */
  DB_SEARCH: D1Database;
  /** D1 `emunas-feedback` (user reports; never wiped). */
  DB_FEEDBACK: D1Database;
  /** Vectorize `emunas-moments`. */
  VEC: VectorIndex;
  /** Workers AI, used only for the query embedding. */
  AI: EmbeddingModel;
  /** Rate limiting binding, 30 requests / 10 s per key. */
  RATE: RateLimiter;
  /** Secret: Turnstile secret key for the listen.<domain> widget. */
  TURNSTILE_SECRET: string;
  /** Secret: salt for the user-agent hash stored with feedback. */
  FEEDBACK_HASH_SALT: string;
  /** Cloudflare Access team origin, e.g. https://<team>.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access application audience tag for listen.<domain>/admin/*. */
  ACCESS_AUD?: string;
  /** Workers AI embedding model; must match the model the vectors were built with. */
  EMBED_MODEL?: string;
}
