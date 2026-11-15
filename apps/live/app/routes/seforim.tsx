// The seforim shelf (C2.6): merged corpus works in shelf order; those cited once or twice collapsed.
import type { JSX } from "react";
import { ShelfPage } from "../features/seforim/ShelfPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.seforim");

export default function Seforim(): JSX.Element {
  return <ShelfPage />;
}
