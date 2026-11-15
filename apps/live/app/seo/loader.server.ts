/**
 * The root route `loader` (W4.5). With `ssr: false` it runs only at build time, once per
 * prerendered path (and once for the SPA fallback), and its result is serialized into that page.
 * Under `ssr: false` a loader on a route without params never revalidates on the client, so no
 * `.data` request is made for it (`build-end.ts` removes the `.data` files React Router writes).
 *
 * It reads `.corpus/` once per build and returns the page's title, description, canonical and
 * hreflang (`head.ts`).
 */
import { createLinks, type Links } from "@emunas/links";
import { findCorpusDir, readSeoCorpus } from "./corpus.server.ts";
import { seoHosts, type Env } from "./env.ts";
import { buildSeoPage, type RootSeoData } from "./head.ts";
import { createPageText, EMPTY_CORPUS, linkDataFor, type PageText } from "./model.ts";

export interface SeoContext {
  links: Links | null;
  pageText: (pathname: string) => PageText | null;
}

let ctx: SeoContext | null = null;

export function createSeoContext(env: Env, cwd: string): SeoContext {
  const hosts = seoHosts(env);
  const dir = findCorpusDir(env, cwd);
  const corpus = dir ? readSeoCorpus(dir) : null;
  const links = hosts ? createLinks({ hosts, data: corpus ? linkDataFor(corpus) : {} }) : null;
  // Without a corpus Today still gets its title and description (they are UI strings).
  return { links, pageText: createPageText(corpus ?? EMPTY_CORPUS) };
}

export function seoDataFor(c: SeoContext, pathname: string): RootSeoData {
  const text = c.pageText(pathname);
  return {
    seo: {
      hosts: c.links?.hosts ?? null,
      page: text ? buildSeoPage(pathname, text, c.links) : null,
    },
  };
}

/** Test hook: forget the cached context. */
export function resetSeoContext(): void {
  ctx = null;
}

/** Header React Router sets when it renders the SPA fallback document. */
export const SPA_MODE_HEADER = "X-React-Router-SPA-Mode";

export function seoLoader({ request }: { request: Request }): RootSeoData {
  ctx ??= createSeoContext(process.env, process.cwd());
  if (request.headers.get(SPA_MODE_HEADER) === "yes") {
    return { seo: { hosts: ctx.links?.hosts ?? null, page: null, fallback: true } };
  }
  return seoDataFor(ctx, new URL(request.url).pathname);
}
