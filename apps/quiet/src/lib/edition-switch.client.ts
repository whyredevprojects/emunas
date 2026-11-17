/**
 * Browser enhancement for the edition switch (concept-quiet §8 "switching edition keeps your
 * place"). The built `href` already points at the same path in the other edition; this adds the
 * live `?query` and `#hash` (`#t=754`, an index anchor, a search query), which only exist at
 * runtime. The href is refreshed on load, on `hashchange`, and right before activation (the
 * player may change the hash with `history.replaceState`, which fires no event).
 */

/** The built href with the current query and hash in place of its own. */
export function withPlace(builtHref: string, search: string, hash: string): string {
  const cut = builtHref.search(/[?#]/);
  const path = cut === -1 ? builtHref : builtHref.slice(0, cut);
  return path + search + hash;
}

export const SWITCH_SELECTOR = "a[data-edition-switch]";

export function keepPlace(doc: Document, loc: Pick<Location, "search" | "hash">, win: Pick<Window, "addEventListener">): void {
  const links = Array.from(doc.querySelectorAll<HTMLAnchorElement>(SWITCH_SELECTOR));
  const built = new Map(links.map((a) => [a, a.getAttribute("href") ?? ""] as const));
  const update = (a: HTMLAnchorElement) => {
    const href = built.get(a);
    if (href) a.setAttribute("href", withPlace(href, loc.search, loc.hash));
  };
  const updateAll = () => links.forEach(update);
  updateAll();
  win.addEventListener("hashchange", updateAll);
  for (const a of links) {
    for (const type of ["pointerdown", "focus", "click"] as const) a.addEventListener(type, () => update(a));
  }
}
