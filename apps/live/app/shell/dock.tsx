/**
 * The dock slot (concept-live §4.1): a region at the foot of the shell whose height is always
 * reserved (CLS ≤ 0.05, tech-live §9), and whose content is mounted once and never remounted by
 * navigation. The player UI (W3.7) registers itself here; until then an idle placeholder shows.
 *
 * Why a registry and not a portal: anything rendered by a route component unmounts when the route
 * changes. The dock content must belong to the shell, which stays mounted for every `/:ui/*` page
 * (including a switch between `/en/…` and `/yi/…`, which only changes the param).
 *
 * ```ts
 * // e.g. in the player UI module, imported once from the shell entry
 * registerDock(PlayerDock);
 * ```
 */
import { useSyncExternalStore, type ComponentType, type JSX } from "react";
import { useT } from "../i18n/index.ts";
import { styles } from "./styles.ts";

export type DockComponent = ComponentType;

let current: DockComponent | null = null;
const listeners = new Set<() => void>();

/** Sets the component rendered in the dock. Returns a function that restores the previous one. */
export function registerDock(component: DockComponent | null): () => void {
  const previous = current;
  current = component;
  for (const l of listeners) l();
  return () => {
    if (current === component) {
      current = previous;
      for (const l of listeners) l();
    }
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = (): DockComponent | null => current;

export function useDockComponent(): DockComponent | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function DockIdle(): JSX.Element {
  const t = useT();
  return <p className={styles.dockIdle}>{t("shell.dockIdle")}</p>;
}

/** The slot itself. Rendered by the shell layout only. */
export function DockSlot(): JSX.Element {
  const t = useT();
  const Content = useDockComponent() ?? DockIdle;
  return (
    <section className={styles.dock} aria-label={t("shell.dock")} data-dock-slot="">
      <Content />
    </section>
  );
}
