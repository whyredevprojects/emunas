/**
 * The Live data contract (`app/data`, W2.4) for Explore, imported in one place.
 *
 * The shared ESLint rule against the pipeline's `data/` folder matches any relative import that climbs
 * into a directory named `data`, which also catches the app's own `app/data` contract folder. This
 * re-export is the single, reviewed exception for this feature (same as `features/today/live-data.ts`).
 */
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract, not the pipeline's data/ folder
export * from "../../data/index.ts";
