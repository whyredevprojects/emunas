import type { Config } from "@react-router/dev/config";
import { liveBuildEnd, livePrerenderPaths } from "./app/seo/config.server.ts";

// Live: static SPA. ssr:false + prerender (integration-plan §1.2, §2.3; W4.5). The route list comes
// from .corpus/ (app/seo/config.server.ts): Today per UI language and every shiur, series, occasion,
// work and person/concept (≥3 shiurim) page. `/` is not prerendered (the site Worker redirects it),
// so the SPA fallback is written as index.html for Cloudflare's single-page-application handling.
// buildEnd writes robots.txt and checks canonical/OG/noindex and the 18k file budget.
// The site Worker (W2.7) serves /, /api/*, /admin/*.
export default {
  appDirectory: "app",
  buildDirectory: "build",
  ssr: false,
  prerender: {
    paths: () => livePrerenderPaths(),
    concurrency: 8,
  },
  buildEnd: (args) => liveBuildEnd(args),
} satisfies Config;
