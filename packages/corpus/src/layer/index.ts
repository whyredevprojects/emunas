/**
 * The corpus-layer projection (C1.2): `.corpus/layer/` from the allow-listed corpus input (C1.1).
 * Node-only build tooling; the file shapes are in `@emunas/corpus/public` (corpus-layer.ts).
 */
export { buildLayer, finishLayer, loadLayerInput, prepareLayer } from "./build.ts";
export type { LayerOutput, LayerSources, PreparedLayer } from "./build.ts";
export { LayerContext } from "./context.ts";
export { LAYER_REDIRECT_KINDS, resolveCorpusRedirects } from "./redirects.ts";
export type { DroppedRedirect, ResolvedRedirects } from "./redirects.ts";
export { statedShiurCounts } from "./stories.ts";
export { foldTerms } from "./synonyms.ts";
export { HUB_SIZE, MAIN_SALIENCE } from "./topics.ts";
export { OCCASION_MIN_SHIURIM } from "./occasion-topics.ts";
export { LEGACY_PERSON_OVERLAP } from "./legacy.ts";
