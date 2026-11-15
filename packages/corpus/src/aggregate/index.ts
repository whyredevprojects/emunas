/**
 * `@emunas/corpus/aggregate`: the aggregate-file types and the pure aggregation over a projected
 * corpus. No Node imports; the Node build wrapper is `@emunas/corpus/build/aggregate`.
 */
export type * from "./types.ts";
export { AGGREGATE_FILES, aggregate, aggregateOutputs, isGuessedOccasion } from "./aggregate.ts";
export type { AggregateInput, AggregateResult } from "./aggregate.ts";
export { parshaPosition, zmanPosition, UNPLACED } from "./calendar-order.ts";
