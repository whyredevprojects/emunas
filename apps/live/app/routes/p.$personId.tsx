// A person (W4.2): cited as a source / in stories / discussed.
import type { JSX } from "react";
import { EntityPage } from "../features/entities/EntityPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.person");

export default function Person(): JSX.Element {
  return <EntityPage kind="p" />;
}
