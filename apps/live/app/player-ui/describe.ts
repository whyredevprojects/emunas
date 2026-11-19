/**
 * Media Session metadata for the Live app (tech-live §4.1, W2.5 note): title = the chapter title in
 * the reading language, artist = the Mashgiach, album = the **series title** when the shiur belongs to a
 * series, else the catalog heading / title (the engine's default).
 */
import type { LocalizedText } from "@emunas/corpus/public";
import { pickText } from "@emunas/i18n";
import { defaultDescribe, type DescribeContext } from "../player-engine/index.ts";

export type SeriesTitleOf = (shiurId: string) => LocalizedText | null;

export function makeDescribe(seriesTitleOf: SeriesTitleOf): (ctx: DescribeContext) => MediaMetadataInit {
  return (ctx) => {
    const base = defaultDescribe(ctx);
    const series = seriesTitleOf(ctx.shiur.id);
    if (!series) return base;
    const album = pickText(series, ctx.readingLang).text;
    return album ? { ...base, album } : base;
  };
}
