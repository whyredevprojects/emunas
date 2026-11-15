/**
 * `/:ui/seforim` (concept-live §5.4, concept-live-corpus C.5): the shelf of merged corpus works,
 * grouped and ordered traditionally (Torah, Nevi'im, Kesuvim, …, Shas, Midrash, Zohar, Rishonim,
 * Acharonim and Chassidus, …), with how many shiurim cite each. A family hub (Rashi, Tosafos, …) is
 * followed by its child works. Works cited in only one or two shiurim have no page: they sit in a
 * collapsed "cited once or twice" row at the end of their group. Generic works are not shelved. A
 * filter box narrows the shelf by name in either script.
 */
import type { UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import { foldBasic } from "@emunas/normalize";
import { useId, useMemo, useState, type JSX } from "react";
import { Link } from "react-router";
import { tFor, useUi } from "../../i18n/index.ts";
import { useLoad } from "../today/use-data.ts";
import { EntityName, LoadState } from "../entities/common.tsx";
import { loadWorks, type WorkSummary, type WorksFile } from "../entities/live-data.ts";
import { browseT } from "../entities/strings.ts";
import { browseStyles as s } from "../entities/styles.ts";
import { isFamilyMember, matchesWork, shelfGroups, type ShelfGroup } from "./model.ts";

const paths = livePaths();

export function ShelfPage(): JSX.Element {
  const ui = useUi();
  const bt = browseT(ui);
  const loaded = useLoad(() => loadWorks(), []);
  return (
    <article className={s.page} aria-busy={loaded.status === "loading"}>
      <h1 className={s.title}>{tFor(ui)("page.seforim")}</h1>
      <p className={s.lead}>{bt("seforim.lead")}</p>
      <LoadState load={loaded} ui={ui} />
      {loaded.status === "ok" ? <Shelf works={loaded.data} ui={ui} /> : null}
    </article>
  );
}

function Shelf({ works, ui }: { works: WorksFile; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const inputId = useId();
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => shelfGroups(works.works), [works]);
  const shelved = useMemo(() => new Set(works.works.filter((w) => w.page).map((w) => w.key)), [works]);
  const folded = foldBasic(filter.trim());
  const keep = (w: WorkSummary) => matchesWork(w, folded, foldBasic);
  const visible = groups
    .map((g): ShelfGroup => ({ ...g, works: g.works.filter(keep), few: g.few.filter(keep) }))
    .filter((g) => g.works.length + g.few.length > 0);

  return (
    <>
      <div className={s.filter} role="search">
        <label htmlFor={inputId}>{bt("seforim.filter")}</label>
        <input id={inputId} className={s.input} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} dir="auto" />
      </div>
      {visible.length === 0 ? <p className={s.muted}>{bt("seforim.filter.none")}</p> : null}
      {visible.map((g) => (
        <section key={g.group} className={s.section} aria-labelledby={`shelf-${g.group}`} data-group={g.group}>
          <h2 id={`shelf-${g.group}`} className={s.sectionTitle} lang={ui}>
            {g.label[ui]}
          </h2>
          {g.works.length > 0 ? (
            <ul className={s.shelf}>
              {g.works.map((w) => (
                <li key={w.key} className={isFamilyMember(w, shelved) ? `${s.row} ${s.child}` : s.row} data-work={w.key}>
                  <Link className={s.rowLink} to={paths.work(ui, w.key)}>
                    <EntityName label={w.label} kind="w" ui={ui} />
                  </Link>
                  <WorkCount w={w} ui={ui} />
                </li>
              ))}
            </ul>
          ) : null}
          {g.few.length > 0 ? <FewRow works={g.few} ui={ui} open={folded !== ""} /> : null}
        </section>
      ))}
    </>
  );
}

function WorkCount({ w, ui }: { w: WorkSummary; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  return (
    <span className={s.momentKind}>
      {bt("seforim.inShiurim", {
        shiurim: bt("browse.shiurim", { count: w.count }),
        mentions: bt("browse.mentions", { count: w.mentions }),
      })}
    </span>
  );
}

/**
 * The collapsed "cited once or twice" row at the end of a shelf group: names and counts, no links
 * (these works have no page). Open while a filter is typed, so a match is never hidden.
 */
export function FewRow({ works, ui, open }: { works: readonly WorkSummary[]; ui: UiLang; open: boolean }): JSX.Element {
  const bt = browseT(ui);
  return (
    <details className={s.few} data-testid="shelf-few" open={open}>
      <summary>{bt("seforim.few", { count: works.length })}</summary>
      <ul className={s.shelf}>
        {works.map((w) => (
          <li key={w.key} className={s.row} data-work-few={w.key}>
            <EntityName label={w.label} kind="w" ui={ui} />
            <WorkCount w={w} ui={ui} />
          </li>
        ))}
      </ul>
    </details>
  );
}
