/** `/robots.txt`. */
import type { APIRoute } from "astro";
import { currentSiteEnv } from "../lib/site-env.ts";
import { robotsTxt } from "../lib/seo.ts";

export const GET: APIRoute = () => {
  const env = currentSiteEnv();
  return new Response(robotsTxt(env.hosts.home, { placeholder: env.placeholder }), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
