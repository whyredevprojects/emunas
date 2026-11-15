// One chapter (or daf) of a sefer (W4.2): the pasuk view, each cited place in order with its moments.
import type { JSX } from "react";
import { WorkPage } from "../features/seforim/WorkPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.workChapter");

export default function WorkChapter(): JSX.Element {
  return <WorkPage />;
}
