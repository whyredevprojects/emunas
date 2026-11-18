/**
 * Person and concept chips for every page that names a corpus entity (concept-live-corpus C.5, E.1):
 *
 * - A person with a page links to `/p/<id>`. A person with 1–2 shiurim and no page (never type
 *   `other`, never excluded) is a chip that opens a small list of those shiurim, in place, with no
 *   page. Anyone else is plain text: no link, no list.
 * - A concept with a page links to `/c/<id>`; a concept merged into a topic links to `/t/<topicId>`
 *   (the topic page is its entry); any other concept is plain text.
 *
 * Ids are corpus ids, already resolved past retired and merged ids by the layer; nothing here looks
 * an id up again.
 */
import type { UiLang } from "@emunas/i18n";
import { livePaths } from "@emunas/links";
import type { JSX } from "react";
import { Link } from "react-router";
import { Text } from "../../components/Text.tsx";
import { yearLabel } from "../today/format.ts";
import type { FacetLabel, PersonChip as PersonChipData } from "./live-data.ts";
import { EntityName } from "./common.tsx";
import { browseT } from "./strings.ts";
import { browseStyles as s } from "./styles.ts";
import { latinEdition } from "../../i18n/content.ts";

const paths = livePaths();

export type PersonChipMode = "page" | "list" | "text";

/** How a person chip renders (see the module comment). */
export function personChipMode(chip: Pick<PersonChipData, "page" | "shiurim">): PersonChipMode {
  if (chip.page) return "page";
  return chip.shiurim && chip.shiurim.length > 0 ? "list" : "text";
}

/** A concept's link: its page, else the topic it is merged into, else none. */
export function conceptHref(ui: UiLang, c: { id: string; page: boolean; topicId?: string | null }): string | null {
  if (c.page) return paths.concept(ui, c.id);
  if (c.topicId) return paths.topic(ui, c.topicId);
  return null;
}

/** The display name of a person in the interface language. */
function personName(label: FacetLabel, ui: UiLang): string {
  return latinEdition(ui) ? label.en : label.he || label.yi;
}

export function PersonChip({ chip, ui }: { chip: PersonChipData; ui: UiLang }): JSX.Element {
  const bt = browseT(ui);
  const mode = personChipMode(chip);
  if (mode === "page") {
    return (
      <Link className={s.chip} to={paths.person(ui, chip.id)} data-person={chip.id}>
        <EntityName label={chip.label} kind="p" ui={ui} />
      </Link>
    );
  }
  if (mode === "text") {
    return (
      <span data-person-text={chip.id}>
        <EntityName label={chip.label} kind="p" ui={ui} />
      </span>
    );
  }
  const shiurim = chip.shiurim ?? [];
  return (
    <details className={s.few} data-person-list={chip.id}>
      <summary aria-label={bt("entity.person.chip", { name: personName(chip.label, ui) })}>
        <EntityName label={chip.label} kind="p" ui={ui} />
        <span className={s.momentKind}>&nbsp;· {bt("browse.shiurim", { count: shiurim.length })}</span>
      </summary>
      <ul className={s.moments}>
        {shiurim.map((x) => {
          const year = yearLabel(x.years);
          return (
            <li key={x.id} className={s.moment}>
              <Link to={paths.shiur(ui, x.id)} data-shiur={x.id}>
                <Text value={x.title} shiurLang={x.lang} />
              </Link>
              {year ? <Text value={year.hebrew} lang="he" /> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export interface ConceptChipData {
  id: string;
  /** The Hebrew term. */
  he: string;
  page: boolean;
  /** Merged into this topic. */
  topicId?: string | null;
}

export function ConceptChip({ concept, ui }: { concept: ConceptChipData; ui: UiLang }): JSX.Element {
  const href = conceptHref(ui, concept);
  const term = <Text value={concept.he} lang="he" />;
  if (!href) return <span data-concept-text={concept.id}>{term}</span>;
  return (
    <Link className={s.chip} to={href} data-concept={concept.id}>
      {term}
    </Link>
  );
}
