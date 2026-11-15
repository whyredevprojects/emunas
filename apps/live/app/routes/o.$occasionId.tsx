// Stub (W2.4). Replaced by W4.2.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.occasion");

export default function Occasion(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.occasion" lead="page.occasion.lead" params={{ id: p["occasionId"] ?? "" }} />;
}
