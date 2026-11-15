// Series index (W3.8): every series, a course and its other-language counterpart side by side.
import type { JSX } from "react";
import { SeriesIndexPage } from "../features/series/SeriesIndexPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.series");

export default function SeriesIndex(): JSX.Element {
  return <SeriesIndexPage />;
}
