/**
 * The W2.4 fixture files used by the Today and series tests, imported in one place (see
 * `../live-data.ts` for why the lint exception is needed: `app/data/fixtures` is not the pipeline's
 * data folder).
 */
/* eslint-disable no-restricted-imports -- app/data/fixtures is the Live contract's fixture tree */
export { fixtureFetch } from "../../../data/fixtures/fetch.ts";
export { default as todayFixture } from "../../../data/fixtures/data/today.json" with { type: "json" };
export { default as facetsFixture } from "../../../data/fixtures/data/facets.json" with { type: "json" };
export { default as shiurNoachFixture } from "../../../data/fixtures/data/shiur/en-parsha-en-nch-01.json" with { type: "json" };
export { default as shiurTanyaFixture } from "../../../data/fixtures/data/shiur/yi-tanya-1-01.json" with { type: "json" };
/* eslint-enable no-restricted-imports */
