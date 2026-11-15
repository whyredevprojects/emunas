/**
 * The Live data contract (`app/data`, W2.4) for the seforim, maasios and entity pages, imported in
 * one place. The shared lint rule against the pipeline's `data/` folder also matches the app's own
 * `app/data` contract folder (`^(\.\./)+data`); this re-export is the reviewed exception for W4.2.
 */
// eslint-disable-next-line no-restricted-imports -- app/data is the Live data contract, not the pipeline's data/ folder
export * from "../../data/index.ts";
