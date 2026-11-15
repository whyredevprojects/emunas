// Stub (W2.4). Replaced by W4.2.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.concept");

export default function Concept(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.concept" lead="page.concept.lead" params={{ id: p["conceptId"] ?? "" }} />;
}
