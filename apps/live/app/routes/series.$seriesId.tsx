// One series (W3.8): parts in seriesOrder, Tanya by perek, side-by-side languages, progress.
import type { JSX } from "react";
import { SeriesPage } from "../features/series/SeriesPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.seriesOne");

export default function Series(): JSX.Element {
  return <SeriesPage />;
}
