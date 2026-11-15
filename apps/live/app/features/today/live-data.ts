/**
 * The Live data contract (`app/data`, W2.4) for the Today and series features, imported in one place.
 *
 * The shared ESLint rule against reaching the pipeline's `data/` folder matches any relative import
 * that climbs into a directory named `data` (`^(\.\./)+data`), which also catches the app's own
 * `app/data` contract folder. This re-export is the single, reviewed exception for these features.
 */
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract, not the pipeline's data/ folder
export * from "../../data/index.ts";
