/**
 * `/:ui/seforim` (concept-live §5.4): the shelf of cited works, grouped and ordered traditionally
 * (Torah, Nevi'im, Kesuvim, …, Shas, Midrash, Zohar, Rishonim, Acharonim and Chassidus, …), with how
 * many shiurim cite each. Genre-only names ("Gemara", "Midrash") are not shelved. A filter box narrows
 * the shelf by name in either script.
 */
import type { UiLang } from "@emunas/i18n";
import { foldBasic } from "@emunas/normalize";
import { useId, useMemo, useState, type JSX } from "react";
import { Link } from "react-router";
import { tFor, useUi } from "../../i18n/index.ts";
import { useLoad } from "../today/use-data.ts";
import { EntityName, LoadState } from "../entities/common.tsx";
import { loadWorks, type WorksFile } from "../entities/live-data.ts";
import { browseT } from "../entities/strings.ts";
import { browseStyles as s } from "../entities/styles.ts";
import { livePaths } from "@emunas/links";
import { matchesWork, shelfGroups } from "./model.ts";

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
  const folded = foldBasic(filter.trim());
  const visible = groups
    .map((g) => ({ ...g, works: g.works.filter((w) => matchesWork(w, folded, foldBasic)) }))
    .filter((g) => g.works.length > 0);

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
          <ul className={s.shelf}>
            {g.works.map((w) => (
              <li key={w.key} className={s.row} data-work={w.key}>
                <Link className={s.rowLink} to={paths.work(ui, w.key)}>
                  <EntityName label={w.label} kind="w" ui={ui} />
                </Link>
                <span className={s.momentKind}>
                  {bt("seforim.inShiurim", {
                    shiurim: bt("browse.shiurim", { count: w.count }),
                    mentions: bt("browse.mentions", { count: w.mentions }),
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
