/**
 * A story card in the Maasios library (concept-live-corpus C.4): the title, the people (a merged
 * person links to their page; a raw name is plain text, never a link or a facet), "told N times",
 * and a play button that plays one telling. A story told at least twice links to its page with every
 * telling; a story told once opens in place and links to the moment in the shiur.
 */
import type { Ed } from "@emunas/corpus/public";
import { formatClock, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useId, useState, type JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import type { FacetLabel, StoryIndexRow } from "../../data/index.ts";
import type { AudioFilter } from "../../shell/settings.ts";
import { choosePlay } from "./model.ts";
import { playTelling } from "./play.ts";
import { maasiosT } from "./strings.ts";
import { maasiosStyles as s } from "./styles.ts";
import { SingleTelling } from "./Telling.tsx";

const paths = livePaths();

export function StoryCard({
  row,
  people,
  ui,
  read,
  audio,
  skipPerson,
}: {
  row: StoryIndexRow;
  people: Readonly<Record<string, FacetLabel>>;
  ui: UiLang;
  read: Ed;
  audio: AudioFilter;
  /** The person the list is faceted on, not repeated on every card. */
  skipPerson?: string | null;
}): JSX.Element {
  const mt = maasiosT(ui);
  const titleId = useId();
  const [failed, setFailed] = useState(false);
  const play = choosePlay(row, audio);
  const linked = row.people.filter((id) => id !== skipPerson && people[id]);
  return (
    <li className={s.card} data-story={row.id} data-tellings={row.tellings}>
      <Text as="h3" id={titleId} className={s.cardTitle} value={row.title} lang={read} />
      {linked.length > 0 || row.names.length > 0 ? (
        <p className={s.meta} data-testid="story-people">
          {linked.map((id) => (
            <Link key={id} to={paths.person(ui, id)} data-entity={`p:${id}`}>
              <Text value={people[id]![ui]} lang={ui} />
            </Link>
          ))}
          {row.names.map((name) => (
            <span key={`n:${name}`} data-name="">
              <Text value={name} shiurLang={ui} />
            </span>
          ))}
        </p>
      ) : null}
      <p className={s.meta}>
        <span data-testid="story-told">{mt("card.told", { count: row.tellings })}</span>
        {row.page ? (
          <Link to={paths.story(ui, row.id)} data-story-link={row.id}>
            {mt("card.tellings")}
          </Link>
        ) : null}
      </p>
      <div className={s.buttons}>
        {play ? (
          <button
            type="button"
            className={`${s.button} ${s.primary}`}
            aria-describedby={titleId}
            data-action="play"
            data-moment={play.momentId}
            onClick={() => {
              setFailed(false);
              playTelling({ storyId: row.id, shiurId: play.shiurId, momentId: play.momentId, start: play.t!, end: play.end }).catch(() =>
                setFailed(true),
              );
            }}
          >
            {mt("card.play")} <bdi dir="ltr">{formatClock(play.t!)}</bdi>
          </button>
        ) : (
          <span className={s.status}>{mt("card.time.none")}</span>
        )}
        {failed ? (
          <span className={s.status} role="status">
            {mt("only.failed")}
          </span>
        ) : null}
      </div>
      {!row.page ? <SingleTelling at={row.first} ui={ui} read={read} /> : null}
    </li>
  );
}
