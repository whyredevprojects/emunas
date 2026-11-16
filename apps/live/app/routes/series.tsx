// Series index (W3.8): every series, one per row; a course in the other language is never paired.
import type { JSX } from "react";
import { SeriesIndexPage } from "../features/series/SeriesIndexPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.series");

export default function SeriesIndex(): JSX.Element {
  return <SeriesIndexPage />;
}
