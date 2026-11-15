/**
 * Quiet search glue (tech-quiet §5, W3.5). Progressive enhancement of `/{ed}/search/`: without
 * script the page lists the indexes; this reveals the search form and renders results.
 *
 * - The query goes through `normalizeQuery` (@emunas/search-core, loaded on first use) and each of
 *   its `variants` is searched (Pagefind ANDs terms); results are merged by best score.
 * - Results render from record meta only (title, citation, one-liner in the edition's language).
 *   No excerpts. Text is set with `textContent`, never parsed as HTML.
 * - Pagefind (`/pagefind/pagefind.js`) is loaded at runtime, not bundled.
 * - `?q=` is read on load and kept in the address bar, so a search can be linked.
 *
 * UI strings come from `data-*` attributes on the `[data-search]` root (no inline script, CSP).
 */

interface ResultData {
  url: string;
  meta: Record<string, string | undefined>;
}
interface PagefindResult {
  id: string;
  score: number;
  data(): Promise<ResultData>;
}
interface Pagefind {
  search(term: string): Promise<{ results: PagefindResult[] } | null>;
}

/** Most results shown. */
const LIMIT = 50;
const PAGEFIND_URL = "/pagefind/pagefind.js";

let pagefind: Promise<Pagefind> | undefined;
const loadPagefind = (): Promise<Pagefind> => (pagefind ??= import(/* @vite-ignore */ PAGEFIND_URL) as Promise<Pagefind>);
const loadNormalize = () => import("@emunas/search-core").then((m) => m.normalizeQuery);

/** Search every variant and merge by id, best score first. */
export async function searchVariants(pf: Pagefind, variants: readonly string[]): Promise<PagefindResult[]> {
  const best = new Map<string, PagefindResult>();
  for (const found of await Promise.all(variants.map((v) => pf.search(v)))) {
    for (const r of found?.results ?? []) {
      const prev = best.get(r.id);
      if (!prev || r.score > prev.score) best.set(r.id, r);
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** `/{ed}/` + the record's edition-less url (`shiur/<id>/`). */
export function resultHref(ed: string, url: string): string {
  return `/${ed}/${url.replace(/^\/+/, "")}`;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** One result row, from meta only. */
export function renderResult(doc: Document, ed: string, d: ResultData, msg: (k: string) => string): HTMLLIElement {
  const li = el(doc, "li", "search-result");
  const a = el(doc, "a", "catalog-title");
  a.href = resultHref(ed, d.url);
  const title = el(doc, "bdi", undefined, d.meta["titleOriginal"] ?? "");
  title.dir = "auto";
  a.append(title);
  li.append(a);
  const cite = d.meta["citation"];
  if (cite) {
    const p = el(doc, "p", "citation");
    const b = el(doc, "bdi", undefined, cite);
    b.dir = "auto";
    p.append(b);
    const n = d.meta["n"];
    if (n) p.append(" · ", msg("number").replace("{n}", n));
    li.append(p);
  }
  const one = d.meta[ed === "yi" ? "oneLinerYi" : "oneLinerEn"];
  li.append(one ? el(doc, "p", "search-oneliner", one) : el(doc, "p", "search-pending", msg("pending")));
  return li;
}

export function initSearch(doc: Document, loc: Location, hist: History): void {
  const root = doc.querySelector<HTMLElement>("[data-search]");
  const form = root?.querySelector("form");
  const input = form?.querySelector<HTMLInputElement>("input[name=q]");
  const status = root?.querySelector<HTMLElement>("[data-search-status]");
  const list = root?.querySelector<HTMLOListElement>("[data-search-results]");
  if (!root || !form || !input || !status || !list) return;
  const ed = root.dataset["ed"] ?? "en";
  const msg = (k: string): string => root.dataset[`msg${k[0]!.toUpperCase()}${k.slice(1)}`] ?? "";

  form.hidden = false;
  for (const e of root.querySelectorAll<HTMLElement>("[data-search-noscript]")) e.hidden = true;

  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = async (q: string): Promise<void> => {
    const mine = ++seq;
    const url = new URL(loc.href);
    if (q.trim()) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    hist.replaceState(hist.state, "", url);
    if (!q.trim()) {
      list.replaceChildren();
      status.textContent = "";
      return;
    }
    status.textContent = msg("searching");
    try {
      const [normalizeQuery, pf] = await Promise.all([loadNormalize(), loadPagefind()]);
      const merged = await searchVariants(pf, normalizeQuery(q).variants);
      const data = await Promise.all(merged.slice(0, LIMIT).map((r) => r.data()));
      if (mine !== seq) return;
      list.replaceChildren(...data.map((d) => renderResult(doc, ed, d, msg)));
      const n = merged.length;
      status.textContent = n === 0 ? msg("none") : (n === 1 ? msg("one") : msg("count")).replace("{n}", String(n));
    } catch {
      if (mine === seq) status.textContent = msg("error");
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
