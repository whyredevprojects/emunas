// Stub (W2.4). Replaced by W3.9.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.shelfSection");

export default function ShelfSection(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.shelfSection" lead="page.shelfSection.lead" params={{ section: p["section"] ?? "" }} />;
}
