/**
 * The Live data contract (W2.4, `app/data`) as the listening room uses it.
 *
 * The shared ESLint rule against climbing into the repo-root `data/` folder (`^(\.\./)+data(/|$)`,
 * integration-plan C3) also matches the app's own `app/data` contract module when imported from a
 * feature folder two levels down. That folder holds only the typed `/data/*` loaders and contract
 * fixtures (no pipeline data), so the one import below is exempted here and everything else in the
 * feature imports from this file. Flagged for the integrator: the rule could exempt `app/data`.
 */
// eslint-disable-next-line no-restricted-imports -- app/data is the Live contract module, not the pipeline data folder
export * from "../../data/index.ts";
