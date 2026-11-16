/**
 * Test-only access to the W2.4 contract fixtures (`app/data/fixtures`), gathered in one place.
 * Imported by `*.test.ts(x)` only; never by app code.
 */
import brshysJson from "../../data/fixtures/data/shiur/yi-parshas-hashavua-brshys-01.json" with { type: "json" };
import brshys03Json from "../../data/fixtures/data/shiur/yi-parshas-hashavua-brshys-03.json" with { type: "json" };
import misc01Json from "../../data/fixtures/data/shiur/en-miscellaneous-en-01.json" with { type: "json" };
import tanyaJson from "../../data/fixtures/data/shiur/yi-tanya-1-01.json" with { type: "json" };
import tvbbJson from "../../data/fixtures/data/shiur/yi-zmanim-tv-bb-04.json" with { type: "json" };
import writeupEnJson from "../../data/fixtures/data/writeup/yi-zmanim-tv-bb-04.en.json" with { type: "json" };
export { fixtureFetch } from "../../data/fixtures/fetch.ts";
import type { ShiurFile, WriteupFile } from "./data.ts";

export const brshys = brshysJson as unknown as ShiurFile;
/** A full shiur with a merged story told twice (page) and one told once, and a same-parsha shiur. */
export const brshys03 = brshys03Json as unknown as ShiurFile;
/** A full shiur with two-shiur threads (inline lines), a story told twice and embedding neighbours. */
export const misc01 = misc01Json as unknown as ShiurFile;
export const tanya = tanyaJson as unknown as ShiurFile;
export const tvbb = tvbbJson as unknown as ShiurFile;
export const tvbbWriteupEn = writeupEnJson as unknown as WriteupFile;

/** A deep copy, for tests that change a fixture. */
export function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/**
 * `misc01` with its first insight moved into a thread that has a page (8 shiurim, 5735 to 5769), as
 * the build writes it for a cluster of three or more visible shiurim.
 */
export function misc01WithThread(): ShiurFile {
  const s = clone(misc01);
  const first = s.corpus!.insights[0]!;
  s.corpus!.insights[0] = { momentId: first.momentId, threadId: "torah-chacham-name-is-torah", shiurCount: 8, years: [5735, 5769], page: true };
  return s;
}
