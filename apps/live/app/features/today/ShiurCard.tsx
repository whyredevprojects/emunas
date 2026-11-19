/**
 * A shiur card (concept-live §5.1): the catalog title as written, the year, the AI one-liner in the
 * reading language, the duration and a language mark. Used by Today's rows and the series pages.
 * The whole card is one link to the listening room.
 */
import type { Ed, LocalizedText, ShiurStatus } from "@emunas/corpus/public";
import { formatDuration, languageName, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { ReaderText } from "../../data/types.ts";
import { yearLabel } from "./format.ts";
import { todayT } from "./strings.ts";
import { todayStyles as s } from "./styles.ts";

export interface CardData {
  id: string;
  lang: Ed;
  title: string;
  /** A `ReaderText` on Today (picked at build time for the reader), a `LocalizedText` elsewhere. */
  oneLiner: LocalizedText | ReaderText | null;
  duration: number;
  years: readonly number[];
  status: ShiurStatus;
}

export interface ShiurCardProps {
  shiur: CardData;
  ui: UiLang;
  /** Reading language for the one-liner. */
  read: UiLang;
  /** Start position for the link (`?t=`). */
  t?: number;
  /** A line above the title (e.g. "Part 3", "Resume at 12:30"). */
  kicker?: ReactNode;
}

const paths = livePaths();

export function shiurHref(ui: UiLang, id: string, t?: number): string {
  return paths.shiur(ui, id, t === undefined ? {} : { t });
}

export function ShiurCard({ shiur, ui, read, t, kicker }: ShiurCardProps): JSX.Element {
  const tt = todayT(ui);
  const year = yearLabel(shiur.years);
  return (
    <Link className={s.card} to={shiurHref(ui, shiur.id, t)} data-shiur={shiur.id}>
      {kicker ? <span className={s.cardMeta}>{kicker}</span> : null}
      <Text as="span" className={s.cardTitle} value={shiur.title} shiurLang={shiur.lang} />
      <span className={s.cardMeta}>
        {year ? (
          <span>
            <Text value={year.hebrew} lang="he" />
            {year.civil ? (
              <>
                {" "}
                <bdi dir="ltr">({year.civil})</bdi>
              </>
            ) : null}
          </span>
        ) : (
          <span>{tt("card.year.unknown")}</span>
        )}
        <span>{formatDuration(shiur.duration, ui)}</span>
        <span lang={ui}>{languageName(shiur.lang, ui)}</span>
      </span>
      {shiur.oneLiner ? (
        <Text as="p" className={s.oneLiner} value={shiur.oneLiner} lang={read} />
      ) : (
        <span className={s.pending}>{tt("card.notesPending")}</span>
      )}
    </Link>
  );
}
