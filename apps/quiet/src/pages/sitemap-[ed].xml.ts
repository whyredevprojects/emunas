/**
 * `/sitemap-yi.xml`, `/sitemap-en.xml`: every page of one edition, with its hreflang alternates
 * (integration-plan §2.3). Listed by /sitemap-index.xml and robots.txt.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { builtPagePaths } from "../components/seo/pages.ts";
import { currentSiteEnv } from "../components/seo/site-env.ts";
import { editionPaths, sitemapXml } from "../components/seo/sitemap.ts";
import { EDS, type Ed } from "../lib/edition.ts";

export const getStaticPaths = (() => EDS.map((ed) => ({ params: { ed } }))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const ed = params["ed"] as Ed;
  const paths = editionPaths(await builtPagePaths(), ed);
  return new Response(sitemapXml(currentSiteEnv().hosts.quiet, paths), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
