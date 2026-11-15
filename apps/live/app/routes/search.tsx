// `/:ui/search?q=` (W4.3): full moment search via /api/search, shiur-level fallback offline.
import type { JSX } from "react";
import { SearchPage } from "../features/command-bar/SearchPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.search");

export default function Search(): JSX.Element {
  return <SearchPage />;
}
