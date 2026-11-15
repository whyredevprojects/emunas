/**
 * The once-per-page label of a corpus entity page (concept-live-corpus E.3, corpus-wave-plan §1
 * rule 4): "Grouped and named by AI across all the shiurim. Not reviewed by a person." When the
 * entity's layer record says `reviewed`, the sentence is "Reviewed" for that entity alone. It sits
 * once under the title, in the same small style as the site's AI note; it is never repeated per card.
 */
import { corpusEntryLabel, type UiLang } from "@emunas/i18n";
import type { JSX } from "react";

export interface CorpusLabelProps {
  ui: UiLang;
  reviewed: boolean;
  className?: string;
}

export function CorpusLabel({ ui, reviewed, className }: CorpusLabelProps): JSX.Element {
  return (
    <p className={className} data-corpus-label={reviewed ? "reviewed" : "ai"}>
      <small>{corpusEntryLabel("live", reviewed, ui)}</small>
    </p>
  );
}
