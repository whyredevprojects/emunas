// Stub (W2.4). Replaced by W4.2.
import type { JSX } from "react";
import { useParams } from "react-router";
import { PageStub, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.workChapter");

export default function WorkChapter(): JSX.Element {
  const p = useParams();
  return (
    <PageStub
      title="page.workChapter"
      lead="page.workChapter.lead"
      params={{ work: p["workId"] ?? "", chapter: p["chapter"] ?? "" }}
    />
  );
}
