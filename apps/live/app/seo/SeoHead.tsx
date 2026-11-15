/**
 * Renders the SEO head tags (`head.ts`) inside the root `<head>`: robots, canonical to Quiet,
 * hreflang, description, OpenGraph. Reads the root loader's build-time page data when it was made
 * for the current path; otherwise derives what it can from the path (client navigation).
 */
import type { JSX } from "react";
import { useLocation, useRouteLoaderData } from "react-router";
import { headTags, type RootSeoData } from "./head.ts";

export function SeoHead(): JSX.Element {
  const { pathname } = useLocation();
  const data = useRouteLoaderData("root") as RootSeoData | undefined;
  const tags = headTags(pathname, data?.seo);
  return (
    <>
      {tags.map((t) => {
        if (t.tag === "link") {
          return t.rel === "canonical" ? (
            <link key="canonical" rel="canonical" href={t.href} />
          ) : (
            <link key={`alt-${t.hrefLang}`} rel="alternate" hrefLang={t.hrefLang} href={t.href} />
          );
        }
        return "name" in t ? (
          <meta key={`n-${t.name}`} name={t.name} content={t.content} />
        ) : (
          <meta key={`p-${t.property}`} property={t.property} content={t.content} />
        );
      })}
    </>
  );
}
