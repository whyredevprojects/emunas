/**
 * Diaspora / Israel schedule for "this week" (parsha and Yom Tov lengths differ). A per-device
 * convenience: remembered in localStorage when available, diaspora otherwise. Every storage access is
 * wrapped, so a blocked store simply forgets.
 */
import { useCallback, useEffect, useState } from "react";

export const ISRAEL_STORAGE_KEY = "emunas.live.israel";

export function readIsrael(): boolean {
  try {
    return globalThis.localStorage?.getItem(ISRAEL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeIsrael(on: boolean): void {
  try {
    if (on) globalThis.localStorage?.setItem(ISRAEL_STORAGE_KEY, "1");
    else globalThis.localStorage?.removeItem(ISRAEL_STORAGE_KEY);
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
}

/** `[israel, setIsrael]`; starts as diaspora (prerendered HTML) and reads the stored choice after mount. */
export function useIsrael(): [boolean, (on: boolean) => void] {
  const [israel, setState] = useState(false);
  useEffect(() => {
    setState(readIsrael());
  }, []);
  const set = useCallback((on: boolean) => {
    setState(on);
    writeIsrael(on);
  }, []);
  return [israel, set];
}
