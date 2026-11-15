declare namespace Cloudflare {
  interface Env {
    DB_SEARCH: D1Database;
    DB_FEEDBACK: D1Database;
    RATE: RateLimit;
    TEST_SEARCH_MIGRATIONS: import("cloudflare:test").D1Migration[];
    TEST_FEEDBACK_MIGRATIONS: import("cloudflare:test").D1Migration[];
    TURNSTILE_SECRET: string;
    FEEDBACK_HASH_SALT: string;
    ACCESS_TEAM_DOMAIN: string;
    ACCESS_AUD: string;
  }
}
