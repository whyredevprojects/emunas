/**
 * `/:ui/s/:shiurId` — the listening room (W3.7). `?t=<sec>` opens at that second; `&m=<momentId>`
 * focuses a moment and starts there (falling back to `t`). The page itself lives in
 * `features/listening-room`; the player dock it registers lives in `player-ui`. The room renders from
 * `shiur/<id>.json` alone, corpus-layer chips and marks included (concept-live-corpus G).
 */
import { ListeningRoomPage } from "../features/listening-room/index.ts";
import { seoMeta } from "../seo/meta.ts";

// Prerendered: the shiur's catalog title (W4.5 root loader data); otherwise "Shiur".
export const meta = seoMeta("page.shiur");

export default ListeningRoomPage;
