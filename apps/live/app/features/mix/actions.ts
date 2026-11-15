/**
 * What the mix does with its items: play them through the existing moment queue (W3.9: each entry
 * plays from its start to its end, then the next, across shiurim), save them as an ordinary
 * playlist, or share them as a playlist link. A saved or shared mix is a fixed list of moments, so it
 * does not shift when the data is rebuilt (concept-live C.3).
 */
import type { UiLang } from "@emunas/i18n";
import { getPersonal, getQueuePlayer, playlistPath, type MomentInput } from "../../store/index.ts";
import type { MixSource } from "./model.ts";

export function mixInputs(items: readonly MixSource[]): MomentInput[] {
  return items.map((x) => ({ shiurId: x.shiurId, start: x.t, end: x.end, momentId: x.id }));
}

/** Replaces the queue with the mix and starts the first item. Returns the number queued. */
export async function playMix(items: readonly MixSource[]): Promise<number> {
  if (items.length === 0) return 0;
  const keys = await getPersonal().replaceQueue(mixInputs(items));
  const first = keys[0];
  if (first !== undefined) await getQueuePlayer().play(first);
  return keys.length;
}

/** Saves the mix as a playlist on the listener's shelf; returns its id. */
export async function saveMix(name: string, items: readonly MixSource[]): Promise<string> {
  return getPersonal().createPlaylist(name, mixInputs(items));
}

/** `/:ui/pl#…` for the mix (the shared-playlist page plays it). */
export function mixLink(ui: UiLang, items: readonly MixSource[]): string {
  return playlistPath(
    ui,
    items.map((x) => ({ shiurId: x.shiurId, start: x.t, end: x.end })),
  );
}
