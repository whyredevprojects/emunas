// The seforim shelf (W4.2): cited works in traditional order, genre-only names not shelved.
import type { JSX } from "react";
import { ShelfPage } from "../features/seforim/ShelfPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.seforim");

export default function Seforim(): JSX.Element {
  return <ShelfPage />;
}
