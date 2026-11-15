// The Maasios library on merged stories (concept-live-corpus C.4, C2.7): facets by person, topic and
// "told more than once", one telling per play, and the stories-only mode.
import type { JSX } from "react";
import { MaasiosPage } from "../features/maasios/MaasiosPage.tsx";
import { seoMeta } from "../seo/meta.ts";

export const meta = seoMeta("page.maasios");

export default function Maasios(): JSX.Element {
  return <MaasiosPage />;
}
