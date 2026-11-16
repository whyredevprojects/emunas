// One series (W3.8, C3.5): the generated overview and arc when there is a synthesis, parts in seriesOrder, Tanya by perek, progress.
import type { JSX } from "react";
import { SeriesPage } from "../features/series/SeriesPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.seriesOne");

export default function Series(): JSX.Element {
  return <SeriesPage />;
}
