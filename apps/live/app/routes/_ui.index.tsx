// Today (W3.8): this week's parsha and occasions, continue, a moment for today, newly summarized.
import type { JSX } from "react";
import { TodayPage } from "../features/today/TodayPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.today");

export default function Today(): JSX.Element {
  return <TodayPage />;
}
