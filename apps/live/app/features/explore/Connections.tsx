/**
 * The Connections lens (concept-live §5.2): one centre entity (person, concept or occasion) and its
 * one-hop neighbours from `entity/<kind>/<key>.json`, never a whole-corpus graph. Edges with fewer
 * than five shared shiurim are hidden, because co-occurrence comes from unreviewed extraction.
 * Choosing a neighbour lists the shiurim along that edge. The list under the graph is the text
 * alternative and carries the same actions.
 */
import { formatNumber, UI_DIR, type UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { useId, useState, type JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { useLoad } from "../today/use-data.ts";
import type { FacetCounts } from "./engine.ts";
import { connectionsModel, entityLabel, MIN_SHARED, polar, sharedRows, type ConnectionEdge } from "./lenses.ts";
import { loadEntity, notFoundToNull, type CorpusRow, type EntityKind, type FacetsFile } from "./live-data.ts";
import { useRoving } from "./roving.ts";
import { exploreT } from "./strings.ts";
import { exploreStyles as s } from "./styles.ts";
import type { ConnectionsCenter } from "./url.ts";

const paths = livePaths();
const SIZE = 420;
const C = SIZE / 2;
const R = 150;

export function entityHref(ui: UiLang, kind: EntityKind, key: string): string {
  if (kind === "p") return paths.person(ui, key);
  if (kind === "c") return paths.concept(ui, key);
  return paths.occasion(ui, key);
}

export interface ConnectionsProps {
  center: ConnectionsCenter | null;
  rows: readonly CorpusRow[];
  facets: FacetsFile;
  counts: FacetCounts | null;
  selected: { p: readonly string[]; c: readonly string[]; o: readonly string[] };
  ui: UiLang;
  /** The Explore URL (query string) centred on another entity. */
  centerHref(c: ConnectionsCenter): string;
}

export function Connections(props: ConnectionsProps): JSX.Element {
  return props.center ? <Graph {...props} center={props.center} /> : <Picker {...props} />;
}

function nameOf(facets: FacetsFile, kind: EntityKind, key: string, ui: UiLang): string {
  return entityLabel(facets, kind, key)?.[ui] ?? key;
}

function Picker({ facets, counts, selected, ui, centerHref }: ConnectionsProps): JSX.Element {
  const et = exploreT(ui);
  const titleId = useId();
  const top = (kind: "p" | "c", facet: "person" | "concept") =>
    Object.entries(counts?.[facet] ?? {})
      .filter(([, n]) => n >= MIN_SHARED)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([key]) => ({ kind, key }));
  const chosen = [
    ...selected.p.map((key) => ({ kind: "p" as const, key })),
    ...selected.c.map((key) => ({ kind: "c" as const, key })),
    ...selected.o.map((key) => ({ kind: "o" as const, key })),
  ];
  const seen = new Set<string>();
  const options = [...chosen, ...top("p", "person"), ...top("c", "concept")].filter((o) => {
    const id = `${o.kind}:${o.key}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return (
    <section className={s.lens} aria-labelledby={titleId} data-lens="connections">
      <h2 id={titleId} className={s.lensTitle}>
        {et("explore.lens.connections")}
      </h2>
      <p className={s.muted}>{et("explore.connections.pick")}</p>
      {options.length > 0 ? (
        <>
          <h3 className={s.subTitle}>{et("explore.connections.pickFrom")}</h3>
          <ul className={s.chips} data-testid="connections-pick">
            {options.map((o) => (
              <li key={`${o.kind}:${o.key}`}>
                <Link className={s.chip} to={centerHref(o)} data-center={`${o.kind}:${o.key}`}>
                  <Text value={nameOf(facets, o.kind, o.key, ui)} shiurLang={ui} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Graph({ center, rows, facets, ui, centerHref }: ConnectionsProps & { center: ConnectionsCenter }): JSX.Element {
  const et = exploreT(ui);
  const titleId = useId();
  const rtl = UI_DIR[ui] === "rtl";
  const entity = useLoad(() => notFoundToNull(loadEntity(center.kind, center.key)), [center.kind, center.key]);
  const [chosen, setChosen] = useState<string | null>(null);
  const name = nameOf(facets, center.kind, center.key, ui);
  const edges = entity.status === "ok" && entity.data ? connectionsModel(entity.data, facets) : [];
  const roving = useRoving(edges.length, rtl);
  const maxShared = Math.max(1, ...edges.map((e) => e.shared));
  const edgeId = (e: ConnectionEdge) => `${e.kind}:${e.key}`;
  const active = edges.find((e) => edgeId(e) === chosen) ?? null;
  const toggle = (e: ConnectionEdge) => setChosen((c) => (c === edgeId(e) ? null : edgeId(e)));

  return (
    <section className={s.lens} aria-labelledby={titleId} data-lens="connections" data-center={`${center.kind}:${center.key}`}>
      <h2 id={titleId} className={s.lensTitle}>
        {withName(et("explore.connections.title"), name, ui)}
      </h2>
      <p className={s.muted}>
        <Link to={entityHref(ui, center.kind, center.key)}>{withName(et("explore.connections.page"), name, ui)}</Link>
      </p>
      {entity.status === "loading" ? <p className={s.muted}>{et("explore.loading")}</p> : null}
      {entity.status === "error" ? (
        <p role="alert" className={s.muted}>
          {et("explore.error")}
        </p>
      ) : null}
      {entity.status === "ok" && entity.data === null ? <p className={s.muted}>{et("explore.connections.missing")}</p> : null}
      {entity.status === "ok" && entity.data !== null ? (
        <>
          <p className={s.muted}>{withName(et("explore.connections.lead", { min: MIN_SHARED }), name, ui)}</p>
          {edges.length === 0 ? (
            <p className={s.muted} data-testid="connections-none">
              {withName(et("explore.connections.none", { min: MIN_SHARED }), name, ui)}
            </p>
          ) : (
            <svg className={s.chart} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-labelledby={titleId}>
              {edges.map((e) => {
                const p = polar(C, C, R, e.turn, rtl);
                return (
                  <line
                    key={`l-${edgeId(e)}`}
                    className={active === e ? `${s.edge} ${s.on}` : s.edge}
                    x1={C}
                    y1={C}
                    x2={p.x}
                    y2={p.y}
                    strokeWidth={1 + 5 * (e.shared / maxShared)}
                    aria-hidden="true"
                  />
                );
              })}
              <g className={s.centerNode} aria-hidden="true">
                <circle cx={C} cy={C} r={34} />
                <text x={C} y={C} textAnchor="middle" dominantBaseline="middle">
                  {short(name, 10)}
                </text>
              </g>
              {edges.map((e, i) => {
                const p = polar(C, C, R, e.turn, rtl);
                const props = roving.item(i, () => toggle(e));
                return (
                  <g
                    key={edgeId(e)}
                    className={active === e ? `${s.node} ${s.on}` : s.node}
                    role="button"
                    aria-pressed={active === e}
                    aria-label={et("explore.connections.edge", { name: e.label[ui], count: formatNumber(e.shared, ui) })}
                    data-edge={edgeId(e)}
                    data-shared={e.shared}
                    {...props}
                  >
                    <circle cx={p.x} cy={p.y} r={8 + 8 * (e.shared / maxShared)} />
                    <text x={p.x} y={p.y + 30} textAnchor="middle" aria-hidden="true">
                      {short(e.label[ui])}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {active ? <EdgeShiurim rows={rows} center={center} edge={active} name={name} ui={ui} /> : null}
          {edges.length > 0 ? (
            <details className={s.alt} open={false}>
              <summary>{et("explore.connections.list")}</summary>
              <ul className={s.edgeList} data-testid="connections-list">
                {edges.map((e) => (
                  <li key={edgeId(e)} data-edge={edgeId(e)}>
                    <button type="button" className={s.textButton} aria-pressed={active === e} onClick={() => toggle(e)}>
                      <Text value={e.label[ui]} shiurLang={ui} />
                    </button>{" "}
                    <span className={s.count}>{et("explore.connections.shared", { count: e.shared })}</span>{" "}
                    <Link to={centerHref({ kind: e.kind, key: e.key })}>{withName(et("explore.connections.recentre"), e.label[ui], ui)}</Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function EdgeShiurim({
  rows,
  center,
  edge,
  name,
  ui,
}: {
  rows: readonly CorpusRow[];
  center: ConnectionsCenter;
  edge: ConnectionEdge;
  name: string;
  ui: UiLang;
}): JSX.Element {
  const et = exploreT(ui);
  const list = sharedRows(rows, center, edge);
  const headingId = useId();
  const along = et("explore.connections.along");
  return (
    <div className={s.edgeShiurim} aria-labelledby={headingId} role="region" data-testid="edge-shiurim">
      <h3 id={headingId} className={s.subTitle}>
        {fill(along, { a: <Text key="a" value={name} shiurLang={ui} />, b: <Text key="b" value={edge.label[ui]} shiurLang={ui} /> })}
      </h3>
      <ul className={s.edgeList}>
        {list.map((r) => (
          <li key={r.id}>
            <Link to={paths.shiur(ui, r.id)} data-shiur={r.id}>
              <Text value={r.title} shiurLang={r.lang} />
            </Link>
          </li>
        ))}
      </ul>
      <p className={s.muted}>
        <Link to={entityHref(ui, edge.kind, edge.key)}>{withName(et("explore.connections.page"), edge.label[ui], ui)}</Link>
      </p>
    </div>
  );
}

function short(text: string, max = 18): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Splits a template on `{name}` placeholders and puts nodes in their place. */
function fill(template: string, parts: Readonly<Record<string, JSX.Element>>): (string | JSX.Element)[] {
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  for (const m of template.matchAll(/\{([a-z]+)\}/g)) {
    const node = parts[m[1]!];
    if (!node) continue;
    out.push(template.slice(last, m.index));
    out.push(node);
    last = m.index + m[0].length;
  }
  out.push(template.slice(last));
  return out;
}

/** A template with `{name}` replaced by a direction-isolated data string. */
function withName(template: string, name: string, ui: UiLang): (string | JSX.Element)[] {
  return fill(template, { name: <Text key="name" value={name} shiurLang={ui} /> });
}
