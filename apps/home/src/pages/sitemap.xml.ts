/** `/sitemap.xml`: every page of the home site (test/site.build.test.ts checks it matches the build). */
import type { APIRoute } from "astro";
import { currentSiteEnv } from "../lib/site-env.ts";
import { SITEMAP_PATHS, sitemapXml } from "../lib/seo.ts";

export const GET: APIRoute = () =>
  new Response(sitemapXml(currentSiteEnv().hosts.home, SITEMAP_PATHS), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
