/**
 * Loads data inside a page component. The pages render their `h1` and frame immediately (prerendered
 * HTML, focus target after navigation) and fill in once the `/data/*` files arrive; a failed load
 * shows an error state instead of throwing, so one missing file never blanks the shell.
 */
import { useEffect, useState, type DependencyList } from "react";

export type Load<T> =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: T; error: null }
  | { status: "error"; data: null; error: unknown };

const LOADING = { status: "loading", data: null, error: null } as const;

/** Runs `load` whenever `deps` change (callers list the load's inputs); stale results are dropped. */
export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Load<T> {
  const [state, setState] = useState<Load<T>>(LOADING);
  useEffect(() => {
    let live = true;
    setState(LOADING);
    load().then(
      (data) => {
        if (live) setState({ status: "ok", data, error: null });
      },
      (error: unknown) => {
        if (live) setState({ status: "error", data: null, error });
      },
    );
    return () => {
      live = false;
    };
  }, deps);
  return state;
}
