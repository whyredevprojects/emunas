// Stub (W2.4). Replaced by W3.7.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.shiur");

export default function ShiurRoom(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.shiur" lead="page.shiur.lead" params={{ id: p["shiurId"] ?? "" }} />;
}
