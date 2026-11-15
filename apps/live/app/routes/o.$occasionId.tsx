// A parsha or zman (W4.2): its shiurim by year and its moments.
import type { JSX } from "react";
import { EntityPage } from "../features/entities/EntityPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.occasion");

export default function Occasion(): JSX.Element {
  return <EntityPage kind="o" />;
}
