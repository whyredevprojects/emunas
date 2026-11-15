// A person (C2.6): the merged corpus person; names, his seforim, cited as a source / in stories / discussed.
import type { JSX } from "react";
import { EntityPage } from "../features/entities/EntityPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.person");

export default function Person(): JSX.Element {
  return <EntityPage kind="p" />;
}
