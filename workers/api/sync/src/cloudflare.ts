/**
 * Cloudflare targets for the real run (CI with CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID):
 *
 * - D1 over the REST API (`/d1/database/{id}/query`), one request per set-based statement
 *   (each carries its chunk as one JSON parameter, see d1-sync.ts);
 * - Vectorize v2 REST (`upsert` as an NDJSON file part, `delete_by_ids`, `list`);
 * - Workers AI REST (`/ai/run/{model}` with `{ text: [...] }`);
 * - R2 `emunas-site-build` over the S3 API (SigV4, `https://<account>.r2.cloudflarestorage.com`),
 *   because the embedding cache is one small object per text and the REST API's global rate
 *   limit (1,200 requests / 5 min) would throttle a first fill of ~34k objects.
 *
 * Every request retries on 429 and 5xx with exponential backoff.
 */
import { createHash, createHmac } from "node:crypto";
import type { BlobStore, Embedder } from "./embed.ts";
import type { SqlTarget, SqlValue, Stmt } from "./sql.ts";
import type { VectorRecord, VectorTarget } from "./vector-sync.ts";

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiOptions {
  accountId: string;
  apiToken: string;
  fetch?: FetchFn;
  baseUrl?: string;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withRetry(fetchFn: FetchFn, url: string, init: RequestInit, retries: number, sleep: (ms: number) => Promise<void>): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetchFn(url, init);
    } catch (e) {
      if (attempt >= retries) throw e;
    }
    if (res !== null && res.status !== 429 && res.status < 500) return res;
    if (res !== null && attempt >= retries) return res;
    const retryAfter = Number(res?.headers.get("retry-after") ?? "");
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 500 * 2 ** attempt));
  }
}

export class CloudflareApi {
  readonly accountId: string;
  private token: string;
  private fetchFn: FetchFn;
  private baseUrl: string;
  private retries: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(o: ApiOptions) {
    this.accountId = o.accountId;
    this.token = o.apiToken;
    this.fetchFn = o.fetch ?? ((i, init) => fetch(i, init));
    this.baseUrl = o.baseUrl ?? "https://api.cloudflare.com/client/v4";
    this.retries = o.retries ?? 6;
    this.sleep = o.sleep ?? defaultSleep;
  }

  /** `/accounts/<id>` + path. */
  account(path: string): string {
    return `/accounts/${this.accountId}${path}`;
  }

  async raw(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<Response> {
    return withRetry(
      this.fetchFn,
      `${this.baseUrl}${path}`,
      { method, headers: { authorization: `Bearer ${this.token}`, ...init.headers }, ...(init.body !== undefined ? { body: init.body } : {}) },
      this.retries,
      this.sleep,
    );
  }

  /** A JSON call; returns `result` from the `{ success, result, errors }` envelope. */
  async call<T>(method: string, path: string, json?: unknown, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<T> {
    const res = await this.raw(method, path, json === undefined ? init : { body: JSON.stringify(json), headers: { "content-type": "application/json" } });
    const text = await res.text();
    let env: { success?: boolean; result?: T; errors?: { message?: string }[] } = {};
    try {
      env = JSON.parse(text) as typeof env;
    } catch {
      // fall through
    }
    if (!res.ok || env.success === false) {
      const msg = env.errors?.map((e) => e.message).join("; ") || text.slice(0, 300);
      throw new ApiError(`${method} ${path.replace(this.accountId, "<account>")}: ${res.status} ${msg}`, res.status);
    }
    return env.result as T;
  }

  /** The token's id (for deriving R2 S3 credentials). */
  async tokenId(): Promise<string> {
    for (const path of ["/user/tokens/verify", this.account("/tokens/verify")]) {
      try {
        const r = await this.call<{ id: string }>("GET", path);
        if (r?.id) return r.id;
      } catch {
        // try the next form (user token vs account token)
      }
    }
    throw new Error("could not verify the API token (needed to derive R2 S3 credentials)");
  }

  get tokenValue(): string {
    return this.token;
  }
}

// ------------------------------------------------------------------------------- D1

interface D1QueryResult<T> {
  results: T[];
  success: boolean;
}

export class D1RestTarget implements SqlTarget {
  readonly name: string;
  constructor(
    private api: CloudflareApi,
    readonly databaseId: string,
    label: string,
  ) {
    this.name = `D1 ${label}`;
  }

  /** Resolve a database by name (`emunas-search`, `emunas-search-staging`). */
  static async byName(api: CloudflareApi, name: string): Promise<D1RestTarget> {
    const list = await api.call<{ uuid: string; name: string }[]>("GET", api.account(`/d1/database?name=${encodeURIComponent(name)}`));
    const db = list.find((d) => d.name === name);
    if (!db) throw new Error(`D1 database ${name} not found in the account`);
    return new D1RestTarget(api, db.uuid, name);
  }

  async all<T extends Record<string, unknown>>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const r = await this.api.call<D1QueryResult<T>[]>("POST", this.api.account(`/d1/database/${this.databaseId}/query`), { sql, params });
    return r[0]?.results ?? [];
  }

  async write(groups: readonly (readonly Stmt[])[]): Promise<void> {
    // Statements run in order, one request each; a group is not atomic remotely, which the
    // sync tolerates (the moments rows, carrying the hash, are always a group's last statement).
    for (const g of groups) {
      for (const s of g) {
        await this.api.call("POST", this.api.account(`/d1/database/${this.databaseId}/query`), { sql: s.sql, params: s.params });
      }
    }
  }

  async close(): Promise<void> {}
}

// ------------------------------------------------------------------------------- Vectorize

export class VectorizeRestTarget implements VectorTarget {
  readonly name: string;
  constructor(
    private api: CloudflareApi,
    readonly index: string,
  ) {
    this.name = `Vectorize ${index}`;
  }

  private path(op: string): string {
    return this.api.account(`/vectorize/v2/indexes/${encodeURIComponent(this.index)}/${op}`);
  }

  async upsert(vectors: readonly VectorRecord[]): Promise<void> {
    if (vectors.length === 0) return;
    const form = new FormData();
    const ndjson = vectors.map((v) => JSON.stringify({ id: v.id, values: v.values, metadata: v.metadata })).join("\n");
    form.append("vectors", new Blob([ndjson], { type: "application/x-ndjson" }), "vectors.ndjson");
    await this.api.call("POST", this.path("upsert"), undefined, { body: form });
  }

  async deleteByIds(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.api.call("POST", this.path("delete_by_ids"), { ids });
  }

  async listIds(): Promise<string[]> {
    const out: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const q: string = `count=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r: { vectors: { id: string }[]; isTruncated: boolean; nextCursor: string | null } = await this.api.call("GET", `${this.path("list")}?${q}`);
      out.push(...r.vectors.map((v) => v.id));
      if (!r.isTruncated || !r.nextCursor) break;
      cursor = r.nextCursor;
    }
    return out.sort();
  }
}

// ------------------------------------------------------------------------------- Workers AI

export const MODEL_DIMS: Readonly<Record<string, number>> = {
  "@cf/baai/bge-m3": 1024,
  "@cf/qwen/qwen3-embedding-0.6b": 1024,
};

export class WorkersAiEmbedder implements Embedder {
  readonly dims: number;
  constructor(
    private api: CloudflareApi,
    readonly model: string,
    readonly maxBatch = 50,
  ) {
    const dims = MODEL_DIMS[model];
    if (dims === undefined) throw new Error(`unknown embedding model ${model}`);
    this.dims = dims;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const r = await this.api.call<{ data?: number[][] }>("POST", this.api.account(`/ai/run/${this.model}`), { text: texts });
    if (!Array.isArray(r?.data)) throw new Error(`${this.model}: no data in response`);
    return r.data;
  }
}

// ------------------------------------------------------------------------------- R2 (S3 API)

export interface S3Credentials {
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * R2 S3 credentials from a Cloudflare API token: access key id = the token id, secret =
 * sha256(token value) (Cloudflare's documented derivation), unless explicit keys are given.
 */
export async function r2Credentials(api: CloudflareApi, env: Record<string, string | undefined>): Promise<S3Credentials> {
  const id = env["R2_ACCESS_KEY_ID"];
  const secret = env["R2_SECRET_ACCESS_KEY"];
  if (id && secret) return { accessKeyId: id, secretAccessKey: secret };
  return { accessKeyId: await api.tokenId(), secretAccessKey: createHash("sha256").update(api.tokenValue).digest("hex") };
}

const sha256hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding as SigV4 wants it (keep `/` in paths when asked). */
export function awsEncode(s: string, keepSlash: boolean): string {
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => `%${(c.codePointAt(0) as number).toString(16).toUpperCase()}`)
    .replace(/%2F/g, keepSlash ? "/" : "%2F");
}

export interface SignInput {
  method: string;
  url: URL;
  headers: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  credentials: S3Credentials;
  /** `YYYYMMDDTHHMMSSZ`. */
  amzDate: string;
}

/** AWS Signature Version 4: returns the Authorization header value. */
export function signV4(i: SignInput): string {
  const date = i.amzDate.slice(0, 8);
  const lower = Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, " ")]));
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join("");
  const signedHeaders = names.join(";");
  const query = [...i.url.searchParams]
    .map(([k, v]) => [awsEncode(k, false), awsEncode(v, false)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const path = i.url.pathname.split("/").map((seg) => awsEncode(decodeURIComponent(seg), false)).join("/");
  const canonical = [i.method, path, query, canonicalHeaders, signedHeaders, i.payloadHash].join("\n");
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", i.amzDate, scope, sha256hex(canonical)].join("\n");
  let key = hmac(`AWS4${i.credentials.secretAccessKey}`, date);
  key = hmac(key, i.region);
  key = hmac(key, i.service);
  key = hmac(key, "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${i.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export class R2S3Store implements BlobStore {
  readonly name: string;
  private fetchFn: FetchFn;
  private endpoint: string;
  private retries: number;
  private sleep: (ms: number) => Promise<void>;
  private now: () => Date;
  constructor(
    accountId: string,
    private bucket: string,
    private credentials: S3Credentials,
    o: { fetch?: FetchFn; endpoint?: string; retries?: number; sleep?: (ms: number) => Promise<void>; now?: () => Date } = {},
  ) {
    this.name = `R2 ${bucket}`;
    this.fetchFn = o.fetch ?? ((u, init) => fetch(u, init));
    this.endpoint = o.endpoint ?? `https://${accountId}.r2.cloudflarestorage.com`;
    this.retries = o.retries ?? 6;
    this.sleep = o.sleep ?? defaultSleep;
    this.now = o.now ?? (() => new Date());
  }

  private async request(method: "GET" | "PUT", key: string, body?: Uint8Array): Promise<Response> {
    const url = new URL(`${this.endpoint}/${this.bucket}/${awsEncode(key, true)}`);
    const payloadHash = sha256hex(body ?? new Uint8Array());
    const amzDate = this.now().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const headers: Record<string, string> = { host: url.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
    const authorization = signV4({ method, url, headers, payloadHash, region: "auto", service: "s3", credentials: this.credentials, amzDate });
    const { host: _host, ...sendHeaders } = headers;
    return withRetry(
      this.fetchFn,
      url.toString(),
      { method, headers: { ...sendHeaders, authorization }, ...(body !== undefined ? { body: new Blob([new Uint8Array(body)]) } : {}) },
      this.retries,
      this.sleep,
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    const res = await this.request("GET", key);
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(`R2 GET ${key}: ${res.status}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const res = await this.request("PUT", key, data);
    if (!res.ok) throw new ApiError(`R2 PUT ${key}: ${res.status}`, res.status);
  }
}
