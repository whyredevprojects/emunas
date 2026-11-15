/** `/sitemap-index.xml`: the two edition sitemaps (integration-plan §2.3). */
import type { APIRoute } from "astro";
import { currentSiteEnv } from "../components/seo/site-env.ts";
import { sitemapIndexXml } from "../components/seo/sitemap.ts";

export const GET: APIRoute = () =>
  new Response(sitemapIndexXml(currentSiteEnv().hosts.quiet), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
