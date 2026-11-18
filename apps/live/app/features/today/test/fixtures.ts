/**
 * The W2.4 fixture files used by the Today and series tests, imported in one place.
 */
export { fixtureFetch } from "../../../data/fixtures/fetch.ts";
/** The English reader's Today file (`today.en.json`), what `/en/` loads. */
export { default as todayFixture } from "../../../data/fixtures/data/today.en.json" with { type: "json" };
/** The Hebrew reader's Today file (`today.he.json`). */
export { default as todayHeFixture } from "../../../data/fixtures/data/today.he.json" with { type: "json" };
export { default as buildFixture } from "../../../data/fixtures/data/build.json" with { type: "json" };
export { default as facetsFixture } from "../../../data/fixtures/data/facets.json" with { type: "json" };
export { default as shiurNoachFixture } from "../../../data/fixtures/data/shiur/en-parsha-en-nch-01.json" with { type: "json" };
export { default as shiurTanyaFixture } from "../../../data/fixtures/data/shiur/yi-tanya-1-01.json" with { type: "json" };
