// Stub (W2.4). Replaced by W4.2.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.person");

export default function Person(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.person" lead="page.person.lead" params={{ id: p["personId"] ?? "" }} />;
}
