// Stub (W2.4). Replaced by W3.8.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.seriesOne");

export default function Series(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.seriesOne" lead="page.seriesOne.lead" params={{ id: p["seriesId"] ?? "" }} />;
}
