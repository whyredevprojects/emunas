// An inyan (W4.2): headed by the Hebrew term, with the chapters about it.
import type { JSX } from "react";
import { EntityPage } from "../features/entities/EntityPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.concept");

export default function Concept(): JSX.Element {
  return <EntityPage kind="c" />;
}
