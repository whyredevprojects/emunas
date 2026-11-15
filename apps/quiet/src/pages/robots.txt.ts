/** `/robots.txt` (integration-plan §2.3). */
import type { APIRoute } from "astro";
import { currentSiteEnv } from "../components/seo/site-env.ts";
import { robotsTxt } from "../components/seo/sitemap.ts";

export const GET: APIRoute = () => {
  const env = currentSiteEnv();
  return new Response(robotsTxt(env.hosts.quiet, { placeholder: env.placeholder.hosts }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
