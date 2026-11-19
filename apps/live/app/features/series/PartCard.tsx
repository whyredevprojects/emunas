/**
 * One part of a series: the shiur card of Today's rows (catalog title as written, year, duration,
 * language mark; the whole card one link to the listening room), with the line under the title
 * chosen by `partLines` (concept-live-corpus C.6): the arc line of a visible part, its own
 * one-liner, "notes not prepared yet" without a synthesis, or nothing for a part that is not
 * visible in a synthesized series. Same classes as `ShiurCard`, so the rows look alike.
 *
 * Only a visible part (`status: "full"`) is a link. A part that is not visible keeps its row in the
 * course, as plain text with the same content, and links nowhere (corpus-wave-plan F.2).
 */
import type { Ed } from "@emunas/corpus/public";
import { formatDuration, languageName, type UiLang } from "@emunas/i18n";
import type { JSX, ReactNode } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { SeriesPart } from "../today/live-data.ts";
import { yearLabel } from "../today/format.ts";
import { shiurHref } from "../today/ShiurCard.tsx";
import { todayT } from "../today/strings.ts";
import { todayStyles as c } from "../today/styles.ts";
import { partVisible, type PartLine } from "./model.ts";

export interface PartCardProps {
  part: SeriesPart;
  lang: Ed;
  line: PartLine;
  ui: UiLang;
  /** Reading language for the line. */
  read: UiLang;
  /** Start position for the link (`?t=`). */
  t?: number;
  kicker?: ReactNode;
}

export function PartCard({ part, lang, line, ui, read, t, kicker }: PartCardProps): JSX.Element {
  const tt = todayT(ui);
  const year = yearLabel(part.years);
  const dataLine = line.kind === "line" ? line.source : line.kind;
  const body = (
    <>
      {kicker ? <span className={c.cardMeta}>{kicker}</span> : null}
      <Text as="span" className={c.cardTitle} value={part.title} shiurLang={lang} />
      <span className={c.cardMeta}>
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
        <span>{formatDuration(part.duration, ui)}</span>
        <span lang={ui}>{languageName(lang, ui)}</span>
      </span>
      {line.kind === "line" ? (
        <Text as="p" className={c.oneLiner} value={line.text} lang={read} />
      ) : line.kind === "pending" ? (
        <span className={c.pending}>{tt("card.notesPending")}</span>
      ) : null}
    </>
  );
  if (!partVisible(part)) {
    return (
      <div className={c.card} data-shiur={part.shiurId} data-line={dataLine} data-unlinked="">
        {body}
      </div>
    );
  }
  return (
    <Link className={c.card} to={shiurHref(ui, part.shiurId, t)} data-shiur={part.shiurId} data-line={dataLine}>
      {body}
    </Link>
  );
}
