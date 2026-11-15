/**
 * In-memory Cache Storage for the Node unit tests: enough of `Cache`/`CacheStorage` for the worker
 * and the download controller (match by URL without fragment, insertion-ordered keys, `put` reads the
 * whole body like the real thing, `addAll` fetches through the given fetch and is all-or-nothing).
 */
type Key = RequestInfo | URL;

function urlOf(key: Key): string {
  const raw = typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
  const u = new URL(raw);
  u.hash = "";
  return u.href;
}

interface Stored {
  body: ArrayBuffer;
  status: number;
  statusText: string;
  headers: [string, string][];
}

function revive(s: Stored): Response {
  return new Response(s.status === 204 ? null : s.body.slice(0), {
    status: s.status,
    statusText: s.statusText,
    headers: s.headers,
  });
}

export class FakeCache implements Cache {
  readonly entries = new Map<string, Stored>();
  constructor(private readonly fetcher: (r: Request) => Promise<Response>) {}

  async match(key: Key, options?: CacheQueryOptions): Promise<Response | undefined> {
    let url = urlOf(key);
    if (options?.ignoreSearch) {
      for (const k of this.entries.keys()) {
        const a = new URL(k);
        const b = new URL(url);
        a.search = "";
        b.search = "";
        if (a.href === b.href) {
          url = k;
          break;
        }
      }
    }
    const s = this.entries.get(url);
    return s ? revive(s) : undefined;
  }

  async matchAll(): Promise<readonly Response[]> {
    return [...this.entries.values()].map(revive);
  }

  async add(key: RequestInfo | URL): Promise<void> {
    await this.addAll([key]);
  }

  async addAll(keys: Iterable<RequestInfo | URL>): Promise<void> {
    const got: [string, Response][] = [];
    for (const k of keys) {
      const res = await this.fetcher(new Request(urlOf(k)));
      if (!res.ok) throw new TypeError(`addAll: ${urlOf(k)} → ${res.status}`);
      got.push([urlOf(k), res]);
    }
    for (const [u, r] of got) await this.put(u, r);
  }

  async put(key: Key, response: Response): Promise<void> {
    if (response.status === 206) throw new TypeError("Cache.put: partial response");
    const body = await response.arrayBuffer();
    const url = urlOf(key);
    this.entries.delete(url);
    this.entries.set(url, {
      body,
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers.entries()],
    });
  }

  async delete(key: Key): Promise<boolean> {
    return this.entries.delete(urlOf(key));
  }

  async keys(): Promise<readonly Request[]> {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
}

export class FakeCacheStorage implements CacheStorage {
  readonly map = new Map<string, FakeCache>();
  constructor(private readonly fetcher: (r: Request) => Promise<Response> = () => Promise.reject(new TypeError("offline"))) {}

  async open(name: string): Promise<Cache> {
    let c = this.map.get(name);
    if (!c) {
      c = new FakeCache(this.fetcher);
      this.map.set(name, c);
    }
    return c;
  }

  async has(name: string): Promise<boolean> {
    return this.map.has(name);
  }

  async delete(name: string): Promise<boolean> {
    return this.map.delete(name);
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }

  async match(key: Key): Promise<Response | undefined> {
    for (const c of this.map.values()) {
      const hit = await c.match(key);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Entry URLs of one cache (test helper). */
  urls(name: string): string[] {
    return [...(this.map.get(name)?.entries.keys() ?? [])];
  }
}
