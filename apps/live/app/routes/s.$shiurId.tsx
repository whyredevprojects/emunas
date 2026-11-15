/**
 * `/:ui/s/:shiurId` — the listening room (W3.7). `?t=<sec>` opens at that second; `&m=<momentId>`
 * focuses a moment and starts there (falling back to `t`). The page itself lives in
 * `features/listening-room`; the player dock it registers lives in `player-ui`.
 */
import { isUiLang } from "@emunas/i18n";
import { tFor } from "../i18n/index.ts";
import { ListeningRoomPage } from "../features/listening-room/index.ts";

export function meta({ params }: { params: Readonly<Record<string, string | undefined>> }) {
  const ui = isUiLang(params["ui"]) ? params["ui"] : "en";
  const t = tFor(ui);
  return [{ title: `${t("page.shiur")} · ${t("site.name")}` }];
}

export default ListeningRoomPage;
