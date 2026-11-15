// A glossary entry (C2.6): the merged corpus concept, headed by the Hebrew term; definition, examples, shiurim.
import type { JSX } from "react";
import { EntityPage } from "../features/entities/EntityPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.concept");

export default function Concept(): JSX.Element {
  return <EntityPage kind="c" />;
}
