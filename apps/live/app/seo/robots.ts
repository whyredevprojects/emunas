/**
 * `robots.txt` for `analyze.<domain>` (integration-plan §2.3): allow all, disallow `/api/` and
 * `/admin/`. No sitemap: the Quiet site is the indexable copy and carries the sitemaps.
 * (`*.workers.dev` hosts are `noindex` by header, set in `public/_headers` and the site Worker.)
 */
export const ROBOTS_TXT = ["User-agent: *", "Allow: /", "Disallow: /api/", "Disallow: /admin/", ""].join("\n");
