// Stub (W2.4). Replaced by W4.3.
import type { JSX } from "react";
import { useSearchParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.search");

export default function Search(): JSX.Element {
  const [params] = useSearchParams();
  const q = params.get("q");
  return q ? (
    <PageStub title="page.search" lead="page.searchQuery" params={{ q }} />
  ) : (
    <PageStub title="page.search" lead="page.search.lead" />
  );
}
