/**
 * A list of stories (concept-live §5.5): the title in the reading language, the people in it (linked
 * when they have a page), the shiur and year, and a link that plays from the story's start.
 */
import type { Ed } from "@emunas/corpus/public";
import type { UiLang } from "@emunas/i18n";
import type { JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { EntityName, MoreButton, ShiurLine, TimeLink, useShowMore } from "../entities/common.tsx";
import type { CorpusRow, StoryRow } from "../entities/live-data.ts";
import type { EntityResolver } from "../entities/resolve.ts";
import { browseStyles as s } from "../entities/styles.ts";

export function StoryList({
  stories,
  rows,
  resolver,
  ui,
  read,
  label,
  step = 30,
  skipPerson,
}: {
  stories: readonly StoryRow[];
  rows: ReadonlyMap<string, CorpusRow>;
  resolver: EntityResolver;
  ui: UiLang;
  read: Ed;
  label: string;
  step?: number;
  /** A person not to repeat on every line (the page's own person). */
  skipPerson?: string;
}): JSX.Element {
  const { shown, more, left } = useShowMore(stories.length, step);
  return (
    <>
      <ol className={s.list} aria-label={label}>
        {stories.slice(0, shown).map((st) => {
          const row = rows.get(st.shiurId);
          const people = st.peopleKeys.filter((k) => k !== skipPerson);
          return (
            <li key={st.id} className={s.place} data-story={st.id}>
              <span className={s.moment}>
                <Text as="strong" className={s.placeLabel} value={st.title} lang={read} />
                <TimeLink ui={ui} moment={st} />
              </span>
              {people.length > 0 ? (
                <span className={s.meta}>
                  {people.map((k) => {
                    const lbl = resolver.label("p", k);
                    const href = resolver.href(ui, "p", k);
                    const name = lbl ? <EntityName label={lbl} kind="p" ui={ui} /> : <Text value={k} lang="en" />;
                    return href ? (
                      <Link key={k} to={href} data-entity={`p:${k}`}>
                        {name}
                      </Link>
                    ) : (
                      <span key={k}>{name}</span>
                    );
                  })}
                </span>
              ) : null}
              {row ? <ShiurLine row={row} ui={ui} /> : null}
            </li>
          );
        })}
      </ol>
      <MoreButton more={more} left={left} ui={ui} />
    </>
  );
}
