// Explore (W4.1): facets, shiurim/moments list and the Luach, Years and Connections lenses.
import type { JSX } from "react";
import { ExplorePage } from "../features/explore/index.ts";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.explore");

export default function Explore(): JSX.Element {
  return <ExplorePage />;
}
