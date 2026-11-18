/**
 * The topic map (concept-live-corpus C.2 "The map"): Explore opens on the level-1 topics as large
 * tiles with their counts, most shiurim first. A tile opens in place to show its level-2 topics, each
 * a link to its topic page; the open tile also links to its own page and to the facet view filtered
 * by it. The facet column, lenses and results are one tap behind ("Filter all shiurim").
 *
 * Labels are in the interface language with the loshon-hakodesh name beside them (`label.he`).
 * Renders from the topic tree (`topics.json`) alone. The grouping is AI-generated: the label sits
 * once, under the heading.
 */
import { formatNumber, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useId, useMemo, useState, type JSX } from "react";
import { Link } from "react-router";
import { CorpusLabel } from "../../components/CorpusLabel.tsx";
import { Text } from "../../components/Text.tsx";
import { hebrewName } from "../topics/labels.ts";
import { topicChildren } from "./FacetPanel.tsx";
import type { TopicNode } from "./live-data.ts";
import { exploreT } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import { labelText } from "../../i18n/content.ts";

const paths = livePaths();

/** Most shiurim first; ties keep the tree's order. */
export function byCount(nodes: readonly TopicNode[]): TopicNode[] {
  return nodes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => b.n.count - a.n.count || a.i - b.i)
    .map((x) => x.n);
}

export interface TopicMapProps {
  tree: readonly TopicNode[];
  ui: UiLang;
  /** The facet view, unfiltered. */
  browseHref: string;
  /** The facet view filtered by one topic. */
  filterHref(topicId: string): string;
}

export function TopicMap({ tree, ui, browseHref, filterHref }: TopicMapProps): JSX.Element {
  const et = exploreT(ui);
  const headingId = useId();
  const children = useMemo(() => topicChildren(tree), [tree]);
  const roots = useMemo(() => byCount(children.get(null) ?? []), [children]);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section className={s.map} aria-labelledby={headingId} data-testid="topic-map">
      <div className={s.mapHead}>
        <h2 id={headingId} className={s.lensTitle}>
          {et("explore.map.title")}
        </h2>
        <Link className={s.pill} to={browseHref} data-testid="explore-browse" preventScrollReset>
          {et("explore.map.browse")}
        </Link>
      </div>
      <p className={s.muted}>{et("explore.map.lead")}</p>
      <CorpusLabel ui={ui} reviewed={false} className={s.aiNote} />
      <ul className={s.tiles}>
        {roots.map((n) => {
          const name = labelText(n.label, ui);
          const he = hebrewName(n.label, ui);
          const kids = byCount(children.get(n.id) ?? []);
          const expanded = open.has(n.id);
          const panelId = `topic-tile-${n.id}`;
          return (
            <li key={n.id} className={s.tile} data-tile={n.id} data-count={n.count} data-open={expanded ? "true" : "false"}>
              <button type="button" className={s.tileButton} aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(n.id)}>
                <Text as="span" className={s.tileName} value={name} lang={ui} />
                {he ? <Text as="span" className={s.tileHe} value={he} lang="he" /> : null}
                <span className={s.tileCount}>{formatNumber(n.count, ui)}</span>
              </button>
              {expanded ? (
                <div id={panelId} className={s.tilePanel}>
                  {kids.length > 0 ? (
                    <ul className={s.tileChildren}>
                      {kids.map((c) => {
                        const che = hebrewName(c.label, ui);
                        return (
                          <li key={c.id} data-child={c.id} data-count={c.count}>
                            <Link className={s.tileChild} to={paths.topic(ui, c.id)}>
                              <Text value={c.label} lang={ui} />
                              {che ? (
                                <>
                                  {" "}
                                  <Text className={s.tileHe} value={che} lang="he" />
                                </>
                              ) : null}
                              <span className={s.count}>{formatNumber(c.count, ui)}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  <p className={s.mapActions}>
                    <Link to={paths.topic(ui, n.id)} data-topic-page={n.id}>
                      {et("explore.map.page", { name })}
                    </Link>
                    <Link to={filterHref(n.id)} data-topic-filter={n.id}>
                      {et("explore.map.filter", { name })}
                    </Link>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
