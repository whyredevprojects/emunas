import { type RouteConfig, index, route } from "@react-router/dev/routes";

/**
 * Live route table (tech-live §1 "Routing", integration-plan §2.2). The interface language is the
 * first path segment (`:ui` ∈ en|yi, validated by the shell); shiur-language and reading-language
 * preferences are query parameters, never path segments.
 *
 * Every page under `/:ui/` renders inside `shell/ui-layout.tsx`, which owns the rail and the dock slot
 * and stays mounted across navigation. Files under `routes/` are stubs until their wave-3/4 owners
 * replace them (file names match the owners' briefs: `_ui.index.tsx` W3.8, `s.$shiurId.tsx` W3.7,
 * `series*.tsx` W3.8, `shelf*.tsx` and `pl.tsx` W3.9). The corpus-layer entries `t/:topicId`,
 * `th/:threadId` and `maasios/:storyId` (corpus-wave-plan §3.5) are C1.7 stubs.
 */
export const UI_CHILD_ROUTES = [
  index("routes/_ui.index.tsx"),
  route("s/:shiurId", "routes/s.$shiurId.tsx"),
  route("explore", "routes/explore.tsx"),
  route("seforim", "routes/seforim.tsx"),
  route("seforim/:workId", "routes/seforim.$workId.tsx"),
  route("seforim/:workId/:chapter", "routes/seforim.$workId.$chapter.tsx"),
  route("maasios", "routes/maasios.tsx"),
  route("maasios/:storyId", "routes/maasios.$storyId.tsx"),
  route("series", "routes/series.tsx"),
  route("series/:seriesId", "routes/series.$seriesId.tsx"),
  route("p/:personId", "routes/p.$personId.tsx"),
  route("c/:conceptId", "routes/c.$conceptId.tsx"),
  route("o/:occasionId", "routes/o.$occasionId.tsx"),
  // Corpus layer (C1.7 stubs; C2.5 topics, C2.7 stories, C3.3 threads replace the bodies).
  route("t/:topicId", "routes/t.$topicId.tsx"),
  route("th/:threadId", "routes/th.$threadId.tsx"),
  route("search", "routes/search.tsx"),
  route("shelf", "routes/shelf.tsx"),
  route("shelf/:section", "routes/shelf.$section.tsx"),
  route("pl", "routes/pl.tsx"),
  route("*", "routes/_ui.not-found.tsx"),
];

export default [
  // `/`: the site Worker redirects by cookie / Accept-Language (C20); this page is the static fallback.
  index("routes/home.tsx"),
  route(":ui", "shell/ui-layout.tsx", UI_CHILD_ROUTES),
] satisfies RouteConfig;
