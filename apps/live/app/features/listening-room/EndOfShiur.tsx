/**
 * When the shiur ends (concept-live-corpus D): the next part if the shiur is in a series; otherwise
 * "continue a thread from this shiur" or "more on <top topic>". These are offers: nothing plays
 * across shiurim until the listener chooses it.
 */
import { livePaths } from "@emunas/links";
import type { JSX } from "react";
import { Link } from "react-router";
import { Text, TEXT_SLOT, aroundText } from "../../components/Text.tsx";
import type { RoomContext } from "./context.ts";
import { endOfShiur } from "./corpus.ts";
import { roomStyles as s } from "./styles.ts";

const paths = livePaths();

export function EndOfShiur({ room }: { room: RoomContext }): JSX.Element {
  const { shiur, rt, ui, reading } = room;
  const offer = endOfShiur(shiur);
  return (
    <section className={s.endPanel} aria-labelledby="room-ended" data-room-ended={offer?.kind ?? "none"}>
      <h2 id="room-ended" className={s.h3}>
        {rt("end.title")}
      </h2>
      {offer?.kind === "next" ? (
        <p>
          <span className={s.kind}>{rt("end.next")} </span>
          <Link to={paths.shiur(ui, offer.shiurId)} className={s.relatedLink} data-end-next={offer.shiurId}>
            {shiur.related.titles[offer.shiurId] ? (
              <Text value={shiur.related.titles[offer.shiurId]!.title} shiurLang={shiur.related.titles[offer.shiurId]!.lang} />
            ) : (
              <Text value={offer.shiurId} lang="en" />
            )}
          </Link>
        </p>
      ) : null}
      {offer?.kind === "thread" ? (
        <p>
          <Link to={paths.thread(ui, offer.thread.threadId)} className={s.relatedLink} data-end-thread={offer.thread.threadId}>
            {rt("end.thread")}
          </Link>
          {offer.thread.text ? (
            <>
              {": "}
              <Text value={offer.thread.text} lang={reading} />
            </>
          ) : null}
        </p>
      ) : null}
      {offer?.kind === "topic" ? (
        <p>
          <Link to={paths.topic(ui, offer.topic.id)} className={s.relatedLink} data-end-topic={offer.topic.id}>
            {aroundText(rt("end.topic", { topic: TEXT_SLOT }), <Text value={offer.topic.label} lang={ui} />)}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
