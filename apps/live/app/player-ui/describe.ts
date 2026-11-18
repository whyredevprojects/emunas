/**
 * Media Session metadata for the Live app (tech-live §4.1, W2.5 note): title = the chapter title in
 * the reading language, artist = the Mashgiach, album = the **series title** when the shiur belongs to a
 * series, else the catalog heading / title (the engine's default).
 */
import type { L } from "@emunas/corpus/public";
import { defaultDescribe, type DescribeContext } from "../player-engine/index.ts";

export type SeriesTitleOf = (shiurId: string) => L | null;

export function makeDescribe(seriesTitleOf: SeriesTitleOf): (ctx: DescribeContext) => MediaMetadataInit {
  return (ctx) => {
    const base = defaultDescribe(ctx);
    const series = seriesTitleOf(ctx.shiur.id);
    if (!series) return base;
    const other = ctx.readingLang === "en" ? "yi" : "en";
    const album = series[ctx.readingLang] || series[other];
    return album ? { ...base, album } : base;
  };
}
