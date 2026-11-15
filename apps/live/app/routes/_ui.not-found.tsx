// Unknown path under /:ui/ (rendered inside the shell, so the dock keeps playing).
import type { JSX } from "react";
import { useUi } from "../i18n/index.ts";
import { NotFound, stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.notFound");

export default function UiNotFound(): JSX.Element {
  return <NotFound ui={useUi()} />;
}
