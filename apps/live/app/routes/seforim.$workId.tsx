// One sefer (W4.2): its cited places in the work's own order, a chapter index for large works.
import type { JSX } from "react";
import { WorkPage } from "../features/seforim/WorkPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.work");

export default function Work(): JSX.Element {
  return <WorkPage />;
}
