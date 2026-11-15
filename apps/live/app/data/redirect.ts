/**
 * Old and retired corpus addresses (corpus-wave-plan §5): when an entity file 404s, the page asks
 * `/data/redirects.json` (loaded lazily, only then) where the entity went, and goes there in one hop.
 * A null target means "nothing matches": the page sends the reader to the index for that kind.
 */
import { DataError, loadRedirects, type LoadOptions } from "./client.ts";
import type { RedirectRouteKind, RedirectsFile } from "./types.ts";

export type RedirectResult = { kind: "page"; route: RedirectRouteKind; id: string } | { kind: "index"; route: RedirectRouteKind } | null;

/** Where `/<route>/<id>` goes per `redirects.json`: a page, the kind's index, or null (not listed). */
export function lookupRedirect(file: Pick<RedirectsFile, "routes">, route: RedirectRouteKind, id: string): RedirectResult {
  const m = file.routes[route];
  if (!m || !Object.hasOwn(m, id)) return null;
  const to = m[id];
  return to ? { kind: "page", route: to.kind, id: to.id } : { kind: "index", route };
}

/** `lookupRedirect` over the deployed file; a missing file reads as "not listed". */
export async function findRedirect(route: RedirectRouteKind, id: string, o: LoadOptions = {}): Promise<RedirectResult> {
  try {
    return lookupRedirect(await loadRedirects(o), route, id);
  } catch (e) {
    if (e instanceof DataError && e.status === 404) return null;
    throw e;
  }
}
