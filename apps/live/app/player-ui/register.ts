/**
 * Puts the player dock into the shell's dock slot (once per page load). Called by every module that
 * can start playback (the listening room today; the queue in W3.9). The slot is owned by the shell,
 * which stays mounted, so the dock is never remounted by navigation.
 *
 * Styles: the dock is first imported from a route chunk (the listening room), and React Router
 * removes a route's stylesheet links when navigating away from it. The dock outlives the route, so
 * its CSS is also injected once as a `<style>` element that no navigation removes (same CSS Module
 * file, so the hashed class names match).
 */
import { registerDock } from "../shell/dock.tsx";
import dockCss from "./PlayerDock.module.css?inline";
import { PlayerDock } from "./PlayerDock.tsx";

export const DOCK_STYLE_ID = "player-dock-css";

let done = false;

function injectStyles(): void {
  if (typeof document === "undefined" || document.getElementById(DOCK_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = DOCK_STYLE_ID;
  el.textContent = dockCss;
  document.head.append(el);
}

export function ensureDockRegistered(): void {
  if (done) return;
  done = true;
  injectStyles();
  registerDock(PlayerDock);
}
