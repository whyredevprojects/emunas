// The maasios library (W4.2): stories by person, playable one by one or back to back.
import type { JSX } from "react";
import { MaasiosPage } from "../features/maasios/MaasiosPage.tsx";
import { stubMeta } from "../shell/PageStub.tsx";

export const meta = stubMeta("page.maasios");

export default function Maasios(): JSX.Element {
  return <MaasiosPage />;
}
