/**
 * `@emunas/corpus/public`: browser-safe. Types of the public contract, timeline helpers, moment ids
 * and shared constants. Nothing here imports Node built-ins.
 */
export type * from "./types.ts";
export * from "./timeline.ts";
export * from "./moment-id.ts";
export * from "./corpus-layer.ts";

/** Bump when the shape of anything in `.corpus/` changes. */
export const SCHEMA_VERSION = 4;

