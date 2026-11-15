/**
 * Puts the player dock into the shell's dock slot (once per page load). Called by every module that
 * can start playback (the listening room today; the queue in W3.9). The slot is owned by the shell,
 * which stays mounted, so the dock is never remounted by navigation.
 */
import { registerDock } from "../shell/dock.tsx";
import { PlayerDock } from "./PlayerDock.tsx";

let done = false;

export function ensureDockRegistered(): void {
  if (done) return;
  done = true;
  registerDock(PlayerDock);
}
