/**
 * Quiet search glue (tech-quiet §5, W3.5, corpus-wave-plan C3.7). Progressive enhancement of
 * `/{ed}/search/`: without script the page lists the indexes; this reveals the search form and
 * renders results.
 *
 * - The query goes through `normalizeQuery` (@emunas/search-core, loaded on first use) with the
 *   corpus synonym table (`/pagefind/synonyms.json`, built by `scripts/build-search.ts` from the
 *   entities' own display fields only). Each of its `variants` is searched (Pagefind ANDs terms), so
 *   "Sanzer Rav" also finds shiurim that say "the Divrei Chaim". Without the table (it failed to
 *   load) the query still finds shiurim, with the normalize tables only, and shows no entries.
 * - Shiur records and entity records are searched apart (`filters.type`). An entity record whose
 *   entity the query names (a headword: `normalizeQuery(...).entities`) comes first, as "Topic: Hashgacha Pratis · 120 shiurim", then the shiurim, merged by
 *   best score. At most `MAX_ENTRIES` entries, one per address.
 * - Results render from record meta only (title; parsha or zman, year and language; one-liner in the edition's language;
 *   for entries kind, label and count). No excerpts. Text is set with `textContent`, never parsed as
 *   HTML.
 * - Pagefind (`/pagefind/pagefind.js`) is loaded at runtime, not bundled.
 * - `?q=` is read on load and kept in the address bar, so a search can be linked.
 *
 * UI strings come from `data-*` attributes on the `[data-search]` root (no inline script, CSP).
 */
import type { NormalizedQuery, SynonymSource, SynonymTable } from "@emunas/search-core";

export interface ResultData {
  url: string;
  meta: Record<string, string | undefined>;
}
export interface PagefindResult {
  id: string;
  score: number;
  data(): Promise<ResultData>;
}
export interface PagefindSearchOptions {
  filters?: Record<string, string | string[]>;
}
export interface Pagefind {
  search(term: string, options?: PagefindSearchOptions): Promise<{ results: PagefindResult[] } | null>;
}

/** Most shiur results shown. */
const LIMIT = 50;
/** Most headword entries shown above the shiurim. */
export const MAX_ENTRIES = 3;
/** Entity hits whose data is read to find the headwords. */
const ENTRY_CANDIDATES = 20;
const PAGEFIND_URL = "/pagefind/pagefind.js";
const SYNONYMS_URL = "/pagefind/synonyms.json";
/** `filters.type` of the two record kinds (scripts/build-search.ts `RECORD_TYPE`). */
export const SHIUR_FILTER: PagefindSearchOptions = { filters: { type: "shiur" } };
export const ENTRY_FILTER: PagefindSearchOptions = { filters: { type: "entry" } };

let pagefind: Promise<Pagefind> | undefined;
const loadPagefind = (): Promise<Pagefind> => (pagefind ??= import(/* @vite-ignore */ PAGEFIND_URL) as Promise<Pagefind>);
const loadSearchCore = () => import("./search-core.ts");

let synonyms: Promise<SynonymTable | null> | undefined;
/** The synonym table, or null when it cannot be loaded (search still works without it). */
const loadSynonyms = (): Promise<SynonymTable | null> =>
  (synonyms ??= Promise.all([loadSearchCore(), fetch(SYNONYMS_URL)])
    .then(async ([core, res]) => (res.ok ? core.buildSynonymTable(parseSynonymRows(await res.json())) : null))
    .catch(() => null));

/** The rows of `synonyms.json`, read defensively (a bad row is skipped). */
export function parseSynonymRows(json: unknown): SynonymSource[] {
  if (!Array.isArray(json)) return [];
  const kinds = new Set(["topic", "concept", "person", "work"]);
  const s = (x: unknown) => (typeof x === "string" ? x : null);
  const out: SynonymSource[] = [];
  for (const r of json as unknown[]) {
    if (r === null || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const kind = s(o["kind"]);
    const id = s(o["id"]);
    if (kind === null || !kinds.has(kind) || id === null) continue;
    const l = (o["labels"] !== null && typeof o["labels"] === "object" ? o["labels"] : {}) as Record<string, unknown>;
    const syn = o["synonyms"];
    out.push({
      kind: kind as SynonymSource["kind"],
      id,
      labels: { he: s(l["he"]), en: s(l["en"]), yi: s(l["yi"]) },
      synonyms: Array.isArray(syn) ? syn.filter((x): x is string => typeof x === "string") : [],
      count: typeof o["count"] === "number" ? o["count"] : 0,
    });
  }
  return out;
}

/** Search every variant and merge by id, best score first. */
export async function searchVariants(pf: Pagefind, variants: readonly string[], options?: PagefindSearchOptions): Promise<PagefindResult[]> {
  const best = new Map<string, PagefindResult>();
  const found = await Promise.all(variants.map((v) => (options === undefined ? pf.search(v) : pf.search(v, options))));
  for (const f of found) {
    for (const r of f?.results ?? []) {
      const prev = best.get(r.id);
      if (!prev || r.score > prev.score) best.set(r.id, r);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * The headword entries among entity hits, in order: entities the query names exactly, then by the
 * first words of a label (`prefix`), each group by visible count; one per address, at most `max`.
 * An entity hit the query does not name (it only shares a word) is not a headword, and without the
 * synonym table nothing is.
 */
export function pickHeadwords(hits: readonly ResultData[], q: Pick<NormalizedQuery, "entities">, max = MAX_ENTRIES): ResultData[] {
  const rank = new Map<string, number>();
  for (const e of q.entities) {
    const k = `${e.kind}:${e.id}`;
    const r = e.match === "exact" ? 0 : 1;
    if (!rank.has(k) || rank.get(k)! > r) rank.set(k, r);
  }
  const scored: { d: ResultData; r: number; n: number }[] = [];
  for (const d of hits) {
    // A record may stand for several entities (a topic and the concepts merged into it).
    let r: number | undefined;
    for (const key of (d.meta["entity"] ?? "").split(" ")) {
      const k = rank.get(key);
      if (k !== undefined && (r === undefined || k < r)) r = k;
    }
    if (r === undefined) continue;
    scored.push({ d, r, n: Number(d.meta["count"] ?? "0") || 0 });
  }
  scored.sort((a, b) => a.r - b.r || b.n - a.n);
  const out: ResultData[] = [];
  const urls = new Set<string>();
  for (const { d } of scored) {
    if (urls.has(d.url)) continue;
    urls.add(d.url);
    out.push(d);
    if (out.length >= max) break;
  }
  return out;
}

/** `/{ed}/` + the record's edition-less url (`shiur/<id>/`, `inyanim/<id>/`, `people/#<id>`). */
export function resultHref(ed: string, url: string): string {
  return `/${ed}/${url.replace(/^\/+/, "")}`;
}

/** The label an entry shows in an edition: its own language first, then Hebrew, then the other. */
export function entryLabel(ed: string, meta: Record<string, string | undefined>): string {
  const order = ed === "yi" ? ["labelYi", "labelHe", "labelEn"] : ["labelEn", "labelHe", "labelYi"];
  for (const k of order) {
    const v = meta[k];
    if (v) return v;
  }
  return "";
}

/** The data key of a kind's label (`kindTopic`, `kindConcept`, …). */
const kindKey = (kind: string): string => `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;

/** The count line of an entry ("120 shiurim"). */
export function countText(n: number, msg: (k: string) => string): string {
  return (n === 1 ? msg("one") : msg("count")).replace("{n}", String(n));
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** One headword entry ("Topic: Hashgacha Pratis · 120 shiurim"), from meta only. */
export function renderEntry(doc: Document, ed: string, d: ResultData, msg: (k: string) => string): HTMLLIElement {
  const li = el(doc, "li", "search-entry");
  const a = el(doc, "a", "catalog-title");
  a.href = resultHref(ed, d.url);
  const kind = msg(kindKey(d.meta["kind"] ?? ""));
  if (kind) a.append(el(doc, "span", "search-entry-kind", `${kind}: `));
  const label = el(doc, "bdi", undefined, entryLabel(ed, d.meta));
  label.dir = "auto";
  a.append(label);
  li.append(a);
  const n = Number(d.meta["count"] ?? "");
  if (Number.isFinite(n) && n > 0) li.append(" · ", countText(n, msg));
  return li;
}

/** One shiur result row, from meta only. */
export function renderResult(doc: Document, ed: string, d: ResultData, msg: (k: string) => string): HTMLLIElement {
  const li = el(doc, "li", "search-result");
  const a = el(doc, "a", "catalog-title");
  a.href = resultHref(ed, d.url);
  const title = el(doc, "bdi", undefined, d.meta["titleOriginal"] ?? "");
  title.dir = "auto";
  a.append(title);
  li.append(a);
  // Occasion · year · language; the catalog strings are isolates.
  const parts: (HTMLElement | string)[] = [];
  for (const text of [d.meta["occasion"], d.meta["year"]]) {
    if (!text) continue;
    const b = el(doc, "bdi", undefined, text);
    b.dir = "auto";
    parts.push(b);
  }
  const lang = d.meta["lang"] === "yi" ? msg("langYi") : d.meta["lang"] === "en" ? msg("langEn") : "";
  if (lang) parts.push(lang);
  if (parts.length > 0) {
    const p = el(doc, "p", "citation");
    parts.forEach((x, i) => (i > 0 ? p.append(" · ", x) : p.append(x)));
    li.append(p);
  }
  const one = d.meta[ed === "yi" ? "oneLinerYi" : "oneLinerEn"];
  li.append(one ? el(doc, "p", "search-oneliner", one) : el(doc, "p", "search-pending", msg("pending")));
  return li;
}

/** Headword entries and shiur results for a query (no DOM). */
export async function searchAll(
  pf: Pagefind,
  q: NormalizedQuery,
  limit = LIMIT,
): Promise<{ entries: ResultData[]; shiurim: ResultData[]; total: number }> {
  const [shiurHits, entryHits] = await Promise.all([searchVariants(pf, q.variants, SHIUR_FILTER), searchVariants(pf, q.variants, ENTRY_FILTER)]);
  const [shiurim, entryData] = await Promise.all([
    Promise.all(shiurHits.slice(0, limit).map((r) => r.data())),
    Promise.all(entryHits.slice(0, ENTRY_CANDIDATES).map((r) => r.data())),
  ]);
  return { entries: pickHeadwords(entryData, q), shiurim, total: shiurHits.length };
}

export function initSearch(doc: Document, loc: Location, hist: History): void {
  const root = doc.querySelector<HTMLElement>("[data-search]");
  const form = root?.querySelector("form");
  const input = form?.querySelector<HTMLInputElement>("input[name=q]");
  const status = root?.querySelector<HTMLElement>("[data-search-status]");
  const list = root?.querySelector<HTMLOListElement>("[data-search-results]");
  const entries = root?.querySelector<HTMLElement>("[data-search-entries]");
  const entryList = entries?.querySelector<HTMLOListElement>("ol");
  if (!root || !form || !input || !status || !list || !entries || !entryList) return;
  const ed = root.dataset["ed"] ?? "en";
  const msg = (k: string): string => root.dataset[`msg${k.charAt(0).toUpperCase()}${k.slice(1)}`] ?? "";

  form.hidden = false;
  for (const e of root.querySelectorAll<HTMLElement>("[data-search-noscript]")) e.hidden = true;

  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    list.replaceChildren();
    entryList.replaceChildren();
    entries.hidden = true;
  };

  const run = async (q: string): Promise<void> => {
    const mine = ++seq;
    const url = new URL(loc.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    hist.replaceState(hist.state, "", url);
    if (!q.trim()) {
      clear();
      status.textContent = "";
      return;
    }
    status.textContent = msg("searching");
    try {
      const [core, table, pf] = await Promise.all([loadSearchCore(), loadSynonyms(), loadPagefind()]);
      const found = await searchAll(pf, core.normalizeQuery(q, table));
      if (mine !== seq) return;
      entryList.replaceChildren(...found.entries.map((d) => renderEntry(doc, ed, d, msg)));
      entries.hidden = found.entries.length === 0;
      list.replaceChildren(...found.shiurim.map((d) => renderResult(doc, ed, d, msg)));
      const n = found.total;
      status.textContent = n === 0 ? msg("none") : countText(n, msg);
    } catch {
      if (mine === seq) {
        clear();
        status.textContent = msg("error");
      }
    }
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(input.value), 250);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(timer);
    void run(input.value);
  });
  const q0 = new URL(loc.href).searchParams.get("q");
  if (q0) {
    input.value = q0;
    void run(q0);
  }
}
