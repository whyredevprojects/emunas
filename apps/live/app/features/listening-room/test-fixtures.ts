/**
 * Test-only access to the W2.4 contract fixtures (`app/data/fixtures`), gathered in one place.
 * Imported by `*.test.ts(x)` only; never by app code.
 */
import brshysJson from "../../data/fixtures/data/shiur/yi-parshas-hashavua-brshys-01.json" with { type: "json" };
import tanyaJson from "../../data/fixtures/data/shiur/yi-tanya-1-01.json" with { type: "json" };
import tvbbJson from "../../data/fixtures/data/shiur/yi-zmanim-tv-bb-04.json" with { type: "json" };
import writeupEnJson from "../../data/fixtures/data/writeup/yi-zmanim-tv-bb-04.en.json" with { type: "json" };
export { fixtureFetch } from "../../data/fixtures/fetch.ts";
import type { ShiurFile, WriteupFile } from "./data.ts";

export const brshys = brshysJson as unknown as ShiurFile;
export const tanya = tanyaJson as unknown as ShiurFile;
export const tvbb = tvbbJson as unknown as ShiurFile;
export const tvbbWriteupEn = writeupEnJson as unknown as WriteupFile;
