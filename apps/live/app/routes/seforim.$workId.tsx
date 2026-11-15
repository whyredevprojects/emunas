// One sefer (C2.6): a merged corpus work; its cited places in order, or a family hub with its children.
import type { JSX } from "react";
import { WorkPage } from "../features/seforim/WorkPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.work");

export default function Work(): JSX.Element {
  return <WorkPage />;
}
