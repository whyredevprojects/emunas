// Stub (W2.4). Replaced by W4.2.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.work");

export default function Work(): JSX.Element {
  const p = useParams();
  return <PageStub title="page.work" lead="page.work.lead" params={{ work: p["workId"] ?? "" }} />;
}
